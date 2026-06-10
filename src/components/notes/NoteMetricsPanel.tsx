import { Eye, EyeOff, Sparkles, Loader2, X, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/components/leads/TagInput";
import type { NoteRow } from "./NotesWorkspace";

export function NoteMetricsPanel({
  note,
  editing,
  tags,
  visibility,
  onTagsChange,
  onVisibilityChange,
  onTogglePin,
  onDelete,
  onSummarize,
  summarizing,
  summary,
  onClearSummary,
}: {
  note: NoteRow;
  editing: boolean;
  tags: string[];
  visibility: "private" | "shared";
  onTagsChange: (t: string[]) => void;
  onVisibilityChange: (v: "private" | "shared") => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onSummarize: () => void;
  summarizing: boolean;
  summary: string | null;
  onClearSummary: () => void;
}) {
  const words = note.body_text.trim().split(/\s+/).filter(Boolean).length;
  const readMin = Math.max(1, Math.round(words / 220));

  return (
    <aside className="w-80 shrink-0 space-y-10 overflow-y-auto border-l border-border/60 bg-muted/20 p-8">
      <div>
        <h5 className="mb-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Note Metrics
        </h5>
        <div className="space-y-4">
          <Row label="Word Count" value={words.toLocaleString()} />
          <Row label="Reading Time" value={`~${readMin} min`} />
          <Row
            label="Last Edited"
            value={new Date(note.updated_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          />
          <Row label="Created" value={new Date(note.created_at).toLocaleDateString()} />
        </div>
      </div>

      <div>
        <h5 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Visibility
        </h5>
        <button
          type="button"
          onClick={() => editing && onVisibilityChange(visibility === "private" ? "shared" : "private")}
          disabled={!editing}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-90"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {visibility === "shared" ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold">
              {visibility === "shared" ? "Shared with team" : "Private Note"}
            </div>
            <div className="text-[10px] font-medium text-muted-foreground">
              {visibility === "shared" ? "Team members can read" : "Only you can access this"}
            </div>
          </div>
        </button>
      </div>

      <div>
        <h5 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Tags
        </h5>
        {editing ? (
          <TagInput value={tags} onChange={onTagsChange} placeholder="Add tag…" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.length === 0 ? (
              <span className="text-xs text-muted-foreground">No tags</span>
            ) : (
              tags.map((t) => (
                <Badge key={t} variant="outline" className="rounded-lg">
                  #{t}
                </Badge>
              ))
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={onTogglePin}>
          {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          {note.pinned ? "Unpin note" : "Pin to top"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-foreground p-6 text-background">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                AI Insight
              </span>
            </div>
            {summary && (
              <button onClick={onClearSummary} className="opacity-60 hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {summary ? (
            <pre className="mb-3 max-h-60 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed opacity-90">
              {summary}
            </pre>
          ) : (
            <p className="mb-4 text-[11px] leading-relaxed opacity-70">
              Summarize this note and extract suggested next actions with AI.
            </p>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="w-full"
            onClick={onSummarize}
            disabled={summarizing || !note.body_text.trim()}
          >
            {summarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {summary ? "Regenerate" : "Generate summary"}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}
