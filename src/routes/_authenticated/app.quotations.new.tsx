import { createFileRoute } from "@tanstack/react-router";
import { QuotationEditor } from "@/components/quotations/QuotationEditor";

export const Route = createFileRoute("/_authenticated/app/quotations/new")({
  head: () => ({ meta: [{ title: "New quotation — Sales Insights" }] }),
  component: () => <QuotationEditor />,
});
