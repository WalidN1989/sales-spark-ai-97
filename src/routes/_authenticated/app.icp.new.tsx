import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { IcpEditor } from "@/components/icp/IcpEditor";

export const Route = createFileRoute("/_authenticated/app/icp/new")({
  head: () => ({ meta: [{ title: "New ICP — Sales Insights" }] }),
  component: NewIcp,
});

function NewIcp() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <div className="space-y-4">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link to="/app/icp" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Product ICP
          </Link>
          <span className="text-sm font-semibold">· New</span>
        </div>
      </HeaderPortal>
      <IcpEditor
        initial={null}
        onSaved={(id) => {
          qc.invalidateQueries({ queryKey: ["icp-profiles"] });
          navigate({ to: "/app/icp/$id", params: { id } });
        }}
      />
    </div>
  );
}
