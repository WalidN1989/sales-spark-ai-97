import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PermissionMap = Record<string, Record<string, boolean>>;

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: roles }, { data: perms }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("user_permissions").select("module, tab, enabled").eq("user_id", userId),
    ]);
    const roleList = (roles ?? []).map((r) => r.role as string);
    const isAdmin = roleList.includes("admin");
    const map: PermissionMap = {};
    for (const p of perms ?? []) {
      map[p.module] = map[p.module] ?? {};
      map[p.module][p.tab] = p.enabled;
    }
    return { roles: roleList, isAdmin, permissions: map };
  });
