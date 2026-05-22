import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/app/meetings")({
  head: () => ({ meta: [{ title: "Meetings — Sales Insights" }] }),
  component: () => (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meetings</h1>
        <p className="text-sm text-muted-foreground">Scheduled visits and on-the-road nearby scan.</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          The Meetings module — scheduled list and Nearby Scan with Google Maps — will be built in
          the next iteration.
        </CardContent>
      </Card>
    </div>
  ),
});
