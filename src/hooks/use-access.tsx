import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, type PermissionMap } from "@/lib/permissions.functions";
import { moduleDefaultVisible } from "@/lib/permissions";

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
    // An explicit permission set by a manager always wins; otherwise fall back
    // to the module's registry default (new modules default to hidden).
    if (explicit !== undefined) return explicit;
    return moduleDefaultVisible(module);
  };
  return { isLoading, isAdmin, isManager, userId: data?.userId ?? null, roles: data?.roles ?? [], can };
}
