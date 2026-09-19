import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2, FolderOpen } from "lucide-react";
import { listQuotations, deleteQuotation, type Quotation } from "@/lib/quotations.functions";
import { fmtMoney } from "@/lib/quote-math";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/quotations/")({
  head: () => ({ meta: [{ title: "Quotations — Sales Insights" }] }),
  component: QuotationsPage,
});

const FILTERS = ["All", "Wacom", "TNA & ACS", "Consumables", "Turnstile & Speed Gates", "Other"];

function QuotationsPage() {
  const list = useServerFn(listQuotations);
  const del = useServerFn(deleteQuotation);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["quotations"], queryFn: () => list() });
  const [filter, setFilter] = useState("All");

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success("Quotation deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quotes = (data ?? []) as Quotation[];
  const visible = quotes.filter((q) => filter === "All" || q.category === filter);

  const countFor = (name: string) =>
    name === "All" ? quotes.length : quotes.filter((q) => q.category === name).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quotations</h1>
          <p className="text-sm text-muted-foreground">
            Client-ready quotes built from your products — VAT, currency and DDP handled.
          </p>
        </div>
        <Button onClick={() => toast.info("The quote editor lands in the next step.")}>
          <Plus className="mr-1 h-4 w-4" /> New quotation
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((name) => (
          <button
            key={name}
            onClick={() => setFilter(name)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === name
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {countFor(name) ? `${name} (${countFor(name)})` : name}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {quotes.length ? "No quotations in this category." : "No quotations yet."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Grand Total</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-xs font-semibold">#{q.quote_number}</TableCell>
                  <TableCell className="font-medium">{q.company_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">{q.category ?? "—"}</TableCell>
                  <TableCell className="text-xs capitalize">{q.status}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {q.currency} {fmtMoney(q.grand_total_cents)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(q.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Open"
                      onClick={() => toast.info("The quote editor lands in the next step.")}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      onClick={() => {
                        if (confirm(`Delete Quotation #${q.quote_number}?`)) remove.mutate(q.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
