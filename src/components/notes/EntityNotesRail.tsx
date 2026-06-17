import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pin, PinOff, Trash2, Save, X, StickyNote, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { listNotes, upsertNote, deleteNote, togglePinNote } from "@/lib/notes.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type EntityType = "prospect" | "lead" | "sale" | "meeting" | "standalone";
type NoteRow = {
  id: string;
  title: string;
  body_text: string;
  pinned: boolean;
  visibility: "private" | "shared";
  updated_at: string;
};

export function EntityNotesRail({
  entityType,
  entityId,
  title = "Notes",
}: {
  entityType: EntityType;
  entityId: string | null;
  title?: string;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listNotes);
  const save = useServerFn(upsertNote);
  const del = useServerFn(deleteNote);
  const pin = useServerFn(togglePinNote);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [saving, setSaving] = useState(false);

  const queryKey = ["notes", entityType, entityId ?? null, ""];
  const { data: notes = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => list({ data: { entityType, entityId: entityId ?? undefined } }),
    enabled: !!entityId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const handleQuickSave = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    try {
      const firstLine = text.split("\n")[0].slice(0, 80);
      await save({
        data: {
          title: firstLine,
          body_text: text,
          body: { text },
          tags: [],
          pinned: false,
          visibility: "private",
          entity_type: entityType,
          entity_id: entityId,
        },
      });
      setDraft("");
      setComposing(false);
      invalidate();
      toast.success("Note added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (n: NoteRow) => {
    const text = editingText.trim();
    if (!text) return;
    setSaving(true);
    try {
      await save({
        data: {
          id: n.id,
          title: text.split("\n")[0].slice(0, 80),
          body_text: text,
          body: { text },
          tags: [],
          pinned: n.pinned,
          visibility: n.visibility,
          entity_type: entityType,
          entity_id: entityId,
        },
      });
      setEditingId(null);
      invalidate();
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    await del({ data: { id } });
    invalidate();
  };

  const handlePin = async (n: NoteRow) => {
    await pin({ data: { id: n.id, pinned: !n.pinned } });
    invalidate();
  };

  const typed = notes as NoteRow[];
  const sorted = [...typed].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="h-4 w-4 text-primary" />
          {title}
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
            {typed.length}
          </span>
        </div>
        {!composing && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setComposing(true)}
            title="Quick note"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {composing && (
          <div className="rounded-xl border border-primary/40 bg-background p-2 shadow-sm">
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Quick note…"
              className="min-h-[80px] resize-none border-0 p-1 text-sm focus-visible:ring-0"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleQuickSave();
                }
              }}
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-muted-foreground">⌘+Enter to save</span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    setComposing(false);
                    setDraft("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" className="h-7 px-2" onClick={handleQuickSave} disabled={saving || !draft.trim()}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        {!entityId ? (
          <p className="p-2 text-xs text-muted-foreground">Save the record first to add notes.</p>
        ) : isLoading ? (
          <p className="p-2 text-xs text-muted-foreground">Loading…</p>
        ) : sorted.length === 0 && !composing ? (
          <button
            onClick={() => setComposing(true)}
            className="w-full rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground hover:border-primary hover:text-primary"
          >
            No notes yet. Click to add one.
          </button>
        ) : (
          sorted.map((n) => (
            <div
              key={n.id}
              className={cn(
                "group rounded-xl border bg-background p-2.5 transition-colors hover:border-primary/40",
                n.pinned ? "border-primary/30 bg-primary/5" : "border-border",
              )}
            >
              {editingId === n.id ? (
                <div className="space-y-1.5">
                  <Textarea
                    autoFocus
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    className="min-h-[80px] resize-none border-0 p-1 text-sm focus-visible:ring-0"
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        handleUpdate(n);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setEditingId(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                    <Button size="sm" className="h-6 px-2" onClick={() => handleUpdate(n)} disabled={saving}>
                      <Save className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(n.id);
                      setEditingText(n.body_text);
                    }}
                    className="block w-full text-left"
                  >
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90 line-clamp-6">
                      {n.body_text || <span className="italic text-muted-foreground">empty</span>}
                    </p>
                  </button>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(n.updated_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => handlePin(n)}
                        title={n.pinned ? "Unpin" : "Pin"}
                      >
                        {n.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleDelete(n.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
