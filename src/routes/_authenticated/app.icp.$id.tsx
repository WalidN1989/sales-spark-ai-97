import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { Button } from "@/components/ui/button";
import { IcpEditor } from "@/components/icp/IcpEditor";
import { getIcpProfile, deleteIcpProfile, type IcpProfile } from "@/lib/icp.functions";

export const Route = createFileRoute("/_authenticated/app/icp/$id")({
  head: () => ({ meta: [{ title: "ICP — Sales Insights" }] }),
  component: IcpDetail,
});

function IcpDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getIcpProfile);
  const delFn = useServerFn(deleteIcpProfile);

  const { data, isLoading } = useQuery<IcpProfile | null>({
    queryKey: ["icp-profile", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const del = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["icp-profiles"] });
      toast.success("Deleted");
      navigate({ to: "/app/icp" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link to="/app/icp" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Product ICP
          </Link>
          {data && <span className="truncate text-sm font-semibold">· {data.name}</span>}
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-rose-600 hover:text-rose-700"
              onClick={() => {
                if (confirm("Delete this ICP profile?")) del.mutate();
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      </HeaderPortal>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Not found.</p>
      ) : (
        <IcpEditor
          initial={data}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["icp-profiles"] });
            qc.invalidateQueries({ queryKey: ["icp-profile", id] });
          }}
        />
      )}
    </div>
  );
}
