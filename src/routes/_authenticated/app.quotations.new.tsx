import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QuotationEditor, type QuotePrefill } from "@/components/quotations/QuotationEditor";
import { getLead } from "@/lib/leads.functions";

// `?lead=<leadId>` opens the editor pre-linked to that lead (from the lead /
// prospect page), so Save / Copy log the quote on it.
export const Route = createFileRoute("/_authenticated/app/quotations/new")({
  head: () => ({ meta: [{ title: "New quotation — Sales Insights" }] }),
  validateSearch: (s: Record<string, unknown>): { lead?: string } => ({
    lead: typeof s.lead === "string" && s.lead ? s.lead : undefined,
  }),
  component: NewQuotation,
});

function NewQuotation() {
  const { lead } = Route.useSearch();
  const getFn = useServerFn(getLead);
  const { data, isLoading } = useQuery({
    queryKey: ["lead", lead],
    queryFn: () => getFn({ data: { id: lead! } }),
    enabled: !!lead,
  });
  if (lead && isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const l = data as
    | { company_name?: string | null; contact_person?: string | null; companies?: { name?: string | null } | null }
    | undefined;
  const prefill: QuotePrefill | null =
    lead && l
      ? {
          lead_id: lead,
          company: l.company_name || l.companies?.name || "",
          contact: l.contact_person ?? null,
        }
      : null;
  return <QuotationEditor key={lead ?? "new"} prefill={prefill} />;
}
