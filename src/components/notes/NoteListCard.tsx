import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteRow } from "./NotesWorkspace";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NoteListCard({
  note,
  active,
  onClick,
}: {
  note: NoteRow;
  active: boolean;
  onClick: () => void;
}) {
  const firstTag = note.tags?.[0];
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full rounded-2xl border p-4 text-left transition-all",
        active
          ? "border-primary bg-card shadow-lg shadow-primary/10 ring-4 ring-primary/10"
          : "border-border/50 bg-card/60 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card hover:shadow-md",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        {firstTag ? (
          <span
            className={cn(
              "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {firstTag}
          </span>
        ) : (
          <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Note
          </span>
        )}
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          {note.pinned && <Pin className="h-3 w-3" />}
          <span>{timeAgo(note.updated_at)}</span>
        </div>
      </div>
      <h3 className="line-clamp-1 text-base font-bold leading-tight">
        {note.title || "Untitled note"}
      </h3>
      {note.body_text && (
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {note.body_text}
        </p>
      )}
    </button>
  );
}
