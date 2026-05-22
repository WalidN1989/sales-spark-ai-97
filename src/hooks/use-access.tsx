import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, type PermissionMap } from "@/lib/permissions.functions";

export function useAccess() {
  const fn = useServerFn(getMyAccess);
  const { data, isLoading } = useQuery({
    queryKey: ["my-access"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
  const isAdmin = data?.isAdmin ?? false;
  const permissions: PermissionMap = data?.permissions ?? {};
  const can = (module: string, tab: string = "*") => {
    if (isAdmin) return true;
    const m = permissions[module];
    if (!m) return true; // default-allow until admin disables
    if (m[tab] !== undefined) return m[tab];
    if (m["*"] !== undefined) return m["*"];
    return true;
  };
  return { isLoading, isAdmin, roles: data?.roles ?? [], can };
}
