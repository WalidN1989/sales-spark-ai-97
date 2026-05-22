import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { listCompanies } from "@/lib/companies.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useAccess } from "@/hooks/use-access";

export const Route = createFileRoute("/_authenticated/app/prospects")({
  head: () => ({ meta: [{ title: "Prospects — Sales Insights" }] }),
  component: ProspectsList,
});

function ProspectsList() {
  const fn = useServerFn(listCompanies);
  const { data, isLoading } = useQuery({ queryKey: ["companies"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const { can } = useAccess();

  const filtered = (data ?? []).filter((c) => {
    const s = q.toLowerCase();
    return (
      !s ||
      c.name?.toLowerCase().includes(s) ||
      c.domain?.toLowerCase().includes(s) ||
      c.industry?.toLowerCase().includes(s) ||
      c.contact_person?.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prospects</h1>
          <p className="text-sm text-muted-foreground">Your private list of target companies.</p>
        </div>
        {can("prospects", "add") && (
          <Button asChild>
            <Link to="/app/prospects/new"><Plus className="mr-1 h-4 w-4" /> Add company</Link>
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, domain, industry…" className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {q ? "No matches." : "No companies yet. Add your first prospect to get started."}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Link key={c.id} to="/app/prospects/$id" params={{ id: c.id }}>
              <Card className="p-4 transition-colors hover:bg-accent">
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
          ))}
        </div>
      )}
    </div>
  );
}
