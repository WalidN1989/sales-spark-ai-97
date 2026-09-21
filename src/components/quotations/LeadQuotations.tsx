import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listQuotationsForLeads, type Quotation } from "@/lib/quotations.functions";
import { fmtMoney } from "@/lib/quote-math";

// Quotations linked to a lead (or to any lead of a prospect), plus a
// "New quotation" button that opens the editor pre-linked to this lead.
export function LeadQuotations({
  leadIds,
  onNew,
}: {
  leadIds: string[];
  onNew: () => void;
}) {
  const navigate = useNavigate();
  const listFn = useServerFn(listQuotationsForLeads);
  const { data: quotes = [] } = useQuery<Quotation[]>({
    queryKey: ["lead-quotations", ...leadIds],
    queryFn: () => listFn({ data: { leadIds } }),
    enabled: leadIds.length > 0,
  });

  return (
    <div className="space-y-2">
      {quotes.length === 0 ? (
        <p className="text-xs text-muted-foreground">No quotations for this company yet.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {quotes.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => navigate({ to: "/app/quotations/$id", params: { id: q.id } })}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0 truncate">
                <span className="font-semibold">#{q.quote_number}</span>{" "}
                <span className="text-muted-foreground">{q.category ?? ""}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs capitalize text-muted-foreground">{q.status}</span>
                <span className="font-medium tabular-nums">
                  {q.currency} {fmtMoney(q.grand_total_cents)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(q.created_at).toLocaleDateString()}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      <Button size="sm" variant="outline" onClick={onNew}>
        <Plus className="mr-1 h-3.5 w-3.5" /> New quotation
      </Button>
    </div>
  );
}
