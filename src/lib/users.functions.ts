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
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, status, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const { data: perms } = await supabaseAdmin
      .from("user_permissions")
      .select("user_id, module, tab, enabled");
    return {
      users: (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role),
        permissions: (perms ?? []).filter((q) => q.user_id === p.id),
      })),
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
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
