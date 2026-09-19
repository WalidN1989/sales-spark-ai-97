import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getQuotation } from "@/lib/quotations.functions";
import { QuotationEditor } from "@/components/quotations/QuotationEditor";

export const Route = createFileRoute("/_authenticated/app/quotations/$id")({
  head: () => ({ meta: [{ title: "Quotation — Sales Insights" }] }),
  component: EditQuotationPage,
});

function EditQuotationPage() {
  const { id } = Route.useParams();
  const fn = useServerFn(getQuotation);
  const { data, isLoading } = useQuery({
    queryKey: ["quotation", id],
    queryFn: () => fn({ data: { id } }),
  });

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (!data) return <p className="p-4 text-sm text-muted-foreground">Quotation not found.</p>;
  return <QuotationEditor initial={data} />;
}
