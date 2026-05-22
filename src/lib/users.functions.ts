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
