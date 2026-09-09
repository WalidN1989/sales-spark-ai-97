import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Target, Users, Building2, Swords } from "lucide-react";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { Button } from "@/components/ui/button";
import { listIcpProfiles, type IcpProfile } from "@/lib/icp.functions";

export const Route = createFileRoute("/_authenticated/app/icp/")({
  head: () => ({ meta: [{ title: "Product ICP — Sales Insights" }] }),
  component: IcpList,
});

function IcpList() {
  const navigate = useNavigate();
  const listFn = useServerFn(listIcpProfiles);
  const { data: items = [], isLoading } = useQuery<IcpProfile[]>({
    queryKey: ["icp-profiles"],
    queryFn: () => listFn(),
  });

  return (
    <div className="space-y-4">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
            <Target className="h-5 w-5 text-primary" /> Product ICP
          </h1>
          <span className="text-xs text-muted-foreground">{items.length}</span>
          <div className="ml-auto">
            <Button size="sm" className="h-8 text-xs" onClick={() => navigate({ to: "/app/icp/new" })}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New ICP
            </Button>
          </div>
        </div>
      </HeaderPortal>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No product profiles yet. Create one to define its ideal customer, existing buyers and competitors.
          </p>
          <Button className="mt-4" size="sm" onClick={() => navigate({ to: "/app/icp/new" })}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New ICP
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((p) => (
            <Link
              key={p.id}
              to="/app/icp/$id"
              params={{ id: p.id }}
              className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.name}</div>
                  {p.category && <div className="text-xs text-muted-foreground">{p.category}</div>}
                </div>
              </div>
              {p.summary && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>}
              {p.industries.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.industries.slice(0, 5).map((ind) => (
                    <span key={ind} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {ind}
                    </span>
                  ))}
                  {p.industries.length > 5 && (
                    <span className="text-[10px] text-muted-foreground">+{p.industries.length - 5}</span>
                  )}
                </div>
              )}
              <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {p.personas.length} personas</span>
                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {p.customers.length} customers</span>
                <span className="flex items-center gap-1"><Swords className="h-3 w-3" /> {p.competitors.length} competitors</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
