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
    const isManager = isAdmin || roleList.includes("manager");
    const map: PermissionMap = {};
    for (const p of perms ?? []) {
      map[p.module] = map[p.module] ?? {};
      map[p.module][p.tab] = p.enabled;
    }
    let hiddenModules: string[] = [];
    // Backward-compatible while the new organization column is being applied.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const database = supabase as any;
    const { data: membership } = await database
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membership?.org_id) {
      const { data: organization } = await database
        .from("organizations")
        .select("hidden_modules")
        .eq("id", membership.org_id)
        .maybeSingle();
      hiddenModules = Array.isArray(organization?.hidden_modules) ? organization.hidden_modules : [];
    }
    return { userId, roles: roleList, isAdmin, isManager, permissions: map, hiddenModules };
  });
