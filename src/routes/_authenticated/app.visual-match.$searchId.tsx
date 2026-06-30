import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getVisualSearch,
  saveMatchAsLead,
  saveMatchAsProspect,
} from "@/lib/visual-match.functions";
import { MatchCard, type VisualMatchRow } from "@/components/visual-match/MatchCard";
import { SaveAsDialog } from "@/components/visual-match/SaveAsDialog";

export const Route = createFileRoute("/_authenticated/app/visual-match/$searchId")({
  head: () => ({ meta: [{ title: "Visual Match — Results" }] }),
  component: SearchDetail,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Search not found.</div>,
});

function deriveName(m: VisualMatchRow): string {
  if (!m.title) return m.source_domain ?? "Unknown";
  // For "Name — Company | LinkedIn" patterns, take left of separator.
  const left = m.title.split(/\s+[-–|]\s+/)[0].trim();
  return left || m.title;
}

function SearchDetail() {
  const { searchId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getVisualSearch);
  const saveProspectFn = useServerFn(saveMatchAsProspect);
  const saveLeadFn = useServerFn(saveMatchAsLead);

  const { data, isLoading } = useQuery({
    queryKey: ["visual-search", searchId],
    queryFn: () => getFn({ data: { id: searchId } }),
  });

  const [dialog, setDialog] = useState<{
    kind: "prospect" | "lead";
    match: VisualMatchRow;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const { search, matches } = data;

  const handleSave = async (name: string, notes: string) => {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.kind === "prospect") {
        const r = await saveProspectFn({
          data: { matchId: dialog.match.id, name, notes },
        });
        toast.success("Prospect created");
        setDialog(null);
        qc.invalidateQueries({ queryKey: ["visual-search", searchId] });
        navigate({ to: "/app/prospects/$id", params: { id: r.companyId } });
      } else {
        const r = await saveLeadFn({
          data: { matchId: dialog.match.id, name, notes },
        });
        toast.success("Lead created");
        setDialog(null);
        qc.invalidateQueries({ queryKey: ["visual-search", searchId] });
        navigate({ to: "/app/leads/$id", params: { id: r.leadId } });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/app/visual-match">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Visual Match
        </Link>
      </Button>

      <div className="flex flex-col sm:flex-row gap-4 items-start rounded-xl border bg-card p-4">
        {search.image_url && (
          <img
            src={search.image_url}
            alt={search.label ?? "uploaded"}
            className="w-full sm:w-48 sm:h-48 object-cover rounded-lg border"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">{search.label || "Untitled search"}</h1>
          <p className="text-sm text-muted-foreground">
            {matches.length} match{matches.length === 1 ? "" : "es"} ·{" "}
            {new Date(search.created_at).toLocaleString()}
          </p>
          {search.status === "error" && (
            <p className="text-sm text-destructive mt-2">{search.error}</p>
          )}
        </div>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No visual matches found for this image.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m as VisualMatchRow}
              onSaveProspect={(mm) => setDialog({ kind: "prospect", match: mm })}
              onSaveLead={(mm) => setDialog({ kind: "lead", match: mm })}
            />
          ))}
        </div>
      )}

      {dialog && (
        <SaveAsDialog
          open
          onOpenChange={(v) => !v && setDialog(null)}
          kind={dialog.kind}
          defaultName={deriveName(dialog.match)}
          defaultNotes={`Found via Visual Match — ${dialog.match.link}`}
          busy={busy}
          onSubmit={handleSave}
        />
      )}
    </div>
  );
}
