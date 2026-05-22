import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/sales")({
  head: () => ({ meta: [{ title: "Sales — Sales Insights" }] }),
  component: () => (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground">CSV upload, transactions, and analytics.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          The Sales module — CSV import, transactions table, and the by-brand/model/service graph —
          will be built in the next iteration.
        </CardContent>
      </Card>
    </div>
  ),
});
