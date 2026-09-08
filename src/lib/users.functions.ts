import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin access required");
}

async function isUserAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function adminCount(): Promise<number> {
  const { count } = await supabaseAdmin
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");
  return count ?? 0;
}

// Guard: refuse an action that would remove the final admin from the workspace.
async function assertNotLastAdmin(targetUserId: string, action: string) {
  if ((await isUserAdmin(targetUserId)) && (await adminCount()) <= 1) {
    throw new Error(`This is the last admin — promote another admin before you ${action}.`);
  }
}

// org_members / organizations aren't in the generated types until Lovable
// regenerates them, so reach them through an untyped handle.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminAny = supabaseAdmin as any;

// Keep the org membership role in step with user_roles. Silently ignores the
// case where the multi-user migration hasn't been applied yet.
async function syncOrgRole(userId: string, role: string) {
  try {
    await adminAny.from("org_members").update({ role }).eq("user_id", userId);
  } catch {
    /* org_members table not present yet */
  }
}

// Readable temp password: no ambiguous chars, guaranteed a digit + symbol.
function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = new Uint32Array(12);
  globalThis.crypto.getRandomValues(arr);
  let s = "";
  for (const n of arr) s += chars[n % chars.length];
  return `${s}#7`;
}

// Create a staff login. The signup triggers seed their profile, role and org
// membership; we then align the requested role. Returns the temp password once
// so the manager can hand it over — it is never stored in plain text elsewhere.
export const createTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().max(200),
        full_name: z.string().trim().max(200).optional(),
        role: z.enum(["admin", "manager", "sales_rep"]).default("sales_rep"),
        password: z.string().min(8).max(72).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const password = data.password ?? genPassword();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name ?? null },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("User was not created");

    // Defensive: guarantee a profile row (the signup trigger normally creates
    // it, but we've seen it miss for some accounts).
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: newId, email: data.email, full_name: data.full_name ?? null }, { onConflict: "id" });

    // New users default to sales_rep via the signup trigger; promote if asked.
    if (data.role !== "sales_rep") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
      await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });
    }
    await syncOrgRole(newId, data.role);

    return { ok: true, user_id: newId, email: data.email, temp_password: password };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    // Source of truth is auth.users so an account always appears even if its
    // profile row was never created; profiles/roles/permissions merge in when
    // present. Banned users are flagged so the UI can show "revoked".
    const { data: authList, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);
    const authUsers = authList?.users ?? [];
    const [{ data: profiles }, { data: roles }, { data: perms }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, email, status"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("user_permissions").select("user_id, module, tab, enabled"),
    ]);
    const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
    return {
      users: authUsers.map((u) => {
        const p = profById.get(u.id);
        const banned = Boolean((u as { banned_until?: string | null }).banned_until);
        return {
          id: u.id,
          full_name: p?.full_name ?? ((u.user_metadata?.full_name as string | undefined) ?? null),
          email: p?.email ?? u.email ?? null,
          status: (banned ? "inactive" : (p?.status ?? "active")) as "active" | "inactive",
          created_at: u.created_at,
          roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
          permissions: (perms ?? []).filter((q) => q.user_id === u.id),
        };
      }),
    };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "manager", "sales_rep"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    // Can't demote the last admin (whether it's you or the only other admin).
    if (data.role !== "admin") await assertNotLastAdmin(data.user_id, "change this role");
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Error(error.message);
    await syncOrgRole(data.user_id, data.role);
    return { ok: true };
  });

export const setUserPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        module: z.string().min(1).max(50),
        tab: z.string().min(1).max(50),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("user_permissions").upsert(
      { user_id: data.user_id, module: data.module, tab: data.tab, enabled: data.enabled },
      { onConflict: "user_id,module,tab" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ user_id: z.string().uuid(), status: z.enum(["active", "inactive"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.status === "inactive") {
      if (data.user_id === context.userId) throw new Error("You can't revoke your own access.");
      await assertNotLastAdmin(data.user_id, "revoke this account");
    }
    // Reflect status on the profile…
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    // …and actually block/allow sign-in by banning/unbanning the auth user, so
    // "revoke" truly locks them out rather than just flagging a column.
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.status === "inactive" ? "876000h" : "none",
    });
    if (banErr) throw new Error(banErr.message);
    return { ok: true };
  });
