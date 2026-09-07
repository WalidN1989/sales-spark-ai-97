import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, type PermissionMap } from "@/lib/permissions.functions";
import { MANAGER_ONLY_MODULES } from "@/lib/permissions";

export function useAccess() {
  const fn = useServerFn(getMyAccess);
  const { data, isLoading } = useQuery({
    queryKey: ["my-access"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
  const isAdmin = data?.isAdmin ?? false;
  const isManager = data?.isManager ?? false;
  const permissions: PermissionMap = data?.permissions ?? {};
  const can = (module: string, tab: string = "*") => {
    if (isManager) return true; // managers/admins see every module
    const m = permissions[module];
    const explicit = m ? (m[tab] !== undefined ? m[tab] : m["*"]) : undefined;
    // Manager-only modules are hidden from reps unless explicitly granted.
    if (MANAGER_ONLY_MODULES.has(module)) return explicit === true;
    // Everything else is allowed until a manager disables it for the user.
    return explicit ?? true;
  };
  return { isLoading, isAdmin, isManager, roles: data?.roles ?? [], can };
}
