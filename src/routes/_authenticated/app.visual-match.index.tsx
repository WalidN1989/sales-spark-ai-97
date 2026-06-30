import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listVisualSearches,
  runVisualSearch,
  deleteVisualSearch,
} from "@/lib/visual-match.functions";
import { ImageCapture } from "@/components/visual-match/ImageCapture";

export const Route = createFileRoute("/_authenticated/app/visual-match")({
  head: () => ({ meta: [{ title: "Visual Match" }] }),
  component: VisualMatchPage,
});

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function VisualMatchPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listVisualSearches);
  const runFn = useServerFn(runVisualSearch);
  const delFn = useServerFn(deleteVisualSearch);

  const { data: searches = [], isLoading } = useQuery({
    queryKey: ["visual-searches"],
    queryFn: () => listFn(),
  });

  const [pending, setPending] = useState(false);

  const handleUploaded = async (path: string, _preview: string, label?: string) => {
    setPending(true);
    try {
      const res = await runFn({ data: { imagePath: path, label: label ?? null } });
      toast.success(`${res.count} match${res.count === 1 ? "" : "es"} found`);
      await qc.invalidateQueries({ queryKey: ["visual-searches"] });
      navigate({ to: "/app/visual-match/$searchId", params: { searchId: res.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setPending(false);
    }
  };

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["visual-searches"] });
      toast.success("Deleted");
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <Camera className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Visual Match</h1>
          <p className="text-sm text-muted-foreground">
            Upload or snap a photo — we'll find where it appears online.
          </p>
        </div>
      </header>

      <ImageCapture onUploaded={handleUploaded} disabled={pending} />

      {pending && (
        <div className="rounded-lg border bg-muted/30 p-4 flex items-center gap-3 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching the web for visual matches…
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">
          Recent searches
        </h2>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : searches.length === 0 ? (
          <div className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
            No searches yet. Take or upload your first photo above.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {searches.map((s) => (
              <Link
                key={s.id}
                to="/app/visual-match/$searchId"
                params={{ searchId: s.id }}
                className="rounded-lg border bg-card overflow-hidden group relative block hover:border-primary/60 hover:shadow-md transition cursor-pointer"
              >
                <div className="aspect-square bg-muted">
                  {s.image_url ? (
                    <img
                      src={s.image_url}
                      alt={s.label ?? "search"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <div className="text-xs font-medium truncate">
                    {s.label || `Search ${timeAgo(s.created_at)}`}
                  </div>
                  <div className="flex items-center justify-between">
                    {s.status === "done" ? (
                      <Badge variant="secondary" className="text-[10px] h-5">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {s.match_count} matches
                      </Badge>
                    ) : s.status === "error" ? (
                      <Badge variant="destructive" className="text-[10px] h-5">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Error
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-5">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        pending
                      </Badge>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm("Delete this search?")) delMut.mutate(s.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
