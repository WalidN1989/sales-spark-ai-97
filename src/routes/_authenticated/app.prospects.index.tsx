import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flame } from "lucide-react";
import { listCompanies } from "@/lib/companies.functions";
import { listLeads, promoteToLead } from "@/lib/leads.functions";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/prospects/")({
  head: () => ({ meta: [{ title: "Prospects — Sales Insights" }] }),
  component: ProspectsList,
});

function ProspectsList() {
  const fn = useServerFn(listCompanies);
  const leadsFn = useServerFn(listLeads);
  const promoteFn = useServerFn(promoteToLead);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["companies"], queryFn: () => fn() });
  const { data: leads } = useQuery({ queryKey: ["leads"], queryFn: () => leadsFn() });
  const promotedSet = new Set((leads ?? []).map((l) => l.company_id));

  const promote = useMutation({
    mutationFn: (companyId: string) => promoteFn({ data: { companyId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(res.created ? "Promoted to Lead" : "Already a Lead");
      navigate({ to: "/app/leads" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prospects</h1>
          <p className="text-sm text-muted-foreground">
            Your private list of target companies.{" "}
            <span className="ml-1 inline-flex items-center gap-1 text-xs">
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Space</kbd>
              <span>search</span>
              <span className="mx-1">·</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+I</kbd>
              <span>add company</span>
              <span className="mx-1">·</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+L</kbd>
              <span>add lead</span>
            </span>
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No companies yet. Press <kbd className="mx-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+I</kbd> to add your first prospect.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const isLead = promotedSet.has(c.id);
            return (
              <div key={c.id} className="relative">
                <Link to="/app/prospects/$id" params={{ id: c.id }}>
                  <Card className="p-4 pr-12 transition-colors hover:bg-accent">
                    <div className="font-semibold">{c.name}</div>
                    {c.domain && <div className="text-xs text-muted-foreground">{c.domain}</div>}
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      {c.industry && <span className="rounded bg-secondary px-2 py-0.5">{c.industry}</span>}
                      {c.country && <span className="rounded bg-secondary px-2 py-0.5">{c.country}</span>}
                    </div>
                    {c.contact_person && (
                      <div className="mt-2 text-xs text-muted-foreground">Contact: {c.contact_person}</div>
                    )}
                  </Card>
                </Link>
                <button
                  type="button"
                  title={isLead ? "Open in Leads" : "Promote to Lead"}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isLead) navigate({ to: "/app/leads" });
                    else promote.mutate(c.id);
                  }}
                  className={cn(
                    "absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full border transition-colors",
                    isLead
                      ? "border-orange-300 bg-orange-100 text-orange-600 hover:bg-orange-200"
                      : "border-border bg-background text-muted-foreground hover:text-orange-500 hover:border-orange-300",
                  )}
                >
                  <Flame className={cn("h-4 w-4", isLead && "fill-orange-500")} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
