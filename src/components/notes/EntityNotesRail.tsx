import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Pin,
  PinOff,
  Trash2,
  Save,
  X,
  StickyNote,
  Loader2,
  Paperclip,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

import {
  listNotes,
  upsertNote,
  deleteNote,
  togglePinNote,
  listNoteAttachments,
  recordNoteAttachment,
  deleteNoteAttachment,
} from "@/lib/notes.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NoteAttachmentLightbox, type Attachment } from "./NoteAttachmentLightbox";

type EntityType = "prospect" | "lead" | "sale" | "meeting" | "standalone";
type NoteRow = {
  id: string;
  title: string;
  body_text: string;
  pinned: boolean;
  visibility: "private" | "shared";
  updated_at: string;
};

const COLLAPSED_MAX_PX = 220;

function AutoTextarea({
  value,
  onChange,
  onKeyDown,
  onPaste,
  placeholder,
  autoFocus,
  minPx = 64,
  maxPx,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  autoFocus?: boolean;
  minPx?: number;
  maxPx?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const cap = maxPx ?? Math.round(window.innerHeight * 0.6);
    const next = Math.min(Math.max(el.scrollHeight, minPx), cap);
    el.style.height = next + "px";
    el.style.overflowY = el.scrollHeight > cap ? "auto" : "hidden";
  };
  useEffect(() => {
    resize();
  }, [value]);
  return (
    <textarea
      ref={ref}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      placeholder={placeholder}
      style={{ minHeight: minPx }}
      className="w-full resize-none border-0 bg-transparent p-1 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0"
    />
  );
}

function NoteCard({
  note,
  entityType,
  entityId,
  saving,
  onSave,
  onPin,
  onDelete,
  onOpenAttachment,
}: {
  note: NoteRow;
  entityType: EntityType;
  entityId: string | null;
  saving: boolean;
  onSave: (n: NoteRow, text: string) => Promise<void>;
  onPin: (n: NoteRow) => void;
  onDelete: (id: string) => void;
  onOpenAttachment: (a: Attachment) => void;
}) {
  void entityType;
  void entityId;
  const qc = useQueryClient();
  const listAttach = useServerFn(listNoteAttachments);
  const recordAttach = useServerFn(recordNoteAttachment);
  const delAttach = useServerFn(deleteNoteAttachment);

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body_text);
  const [expanded, setExpanded] = useState(false);
  const [showAtt, setShowAtt] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(note.body_text);
  }, [note.body_text]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setNeedsClamp(el.scrollHeight > COLLAPSED_MAX_PX + 4);
  }, [note.body_text]);

  const { data: attachments = [] } = useQuery({
    queryKey: ["note-attachments", note.id],
    queryFn: () => listAttach({ data: { noteId: note.id } }),
  });
  const typedAtt = attachments as Attachment[];

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/") && file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const path = `${uid}/${note.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("note-attachments").upload(path, file);
      if (error) throw error;
      await recordAttach({
        data: {
          note_id: note.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      qc.invalidateQueries({ queryKey: ["note-attachments", note.id] });
      setShowAtt(true);
      toast.success("Attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          await upload(file);
          return;
        }
      }
    }
  };

  return (
    <div
      className={cn(
        "group rounded-xl border bg-background p-2.5 transition-colors",
        note.pinned ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/40",
      )}
    >
      {editing ? (
        <div className="space-y-1.5" onPaste={onPaste}>
          <AutoTextarea
            value={text}
            onChange={setText}
            autoFocus
            minPx={80}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onSave(note, text).then(() => setEditing(false));
              }
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <div className="flex items-center justify-between gap-1">
            <label className="cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = "";
                }}
              />
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Paperclip className="h-3.5 w-3.5" />
              )}
            </label>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => {
                  setEditing(false);
                  setText(note.body_text);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                className="h-6 px-2"
                onClick={() => onSave(note, text).then(() => setEditing(false))}
                disabled={saving}
              >
                <Save className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={textRef}
            onClick={() => setEditing(true)}
            className={cn(
              "relative cursor-text overflow-hidden",
              !expanded && needsClamp && "mask-fade",
            )}
            style={!expanded ? { maxHeight: COLLAPSED_MAX_PX } : undefined}
          >
            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/90">
              {note.body_text || <span className="italic text-muted-foreground">empty</span>}
            </p>
          </div>
          {needsClamp && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[10px] font-semibold text-primary hover:underline"
            >
              {expanded ? "less" : "more…"}
            </button>
          )}

          {typedAtt.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowAtt((v) => !v)}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <Paperclip className="h-3 w-3" />
                {typedAtt.length}
              </button>
              {showAtt && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {typedAtt.map((a) => (
                    <div key={a.id} className="group/att relative">
                      {a.mime_type?.startsWith("image/") && a.url ? (
                        <button
                          type="button"
                          onClick={() => onOpenAttachment(a)}
                          className="block h-14 w-14 overflow-hidden rounded-md border border-border bg-muted"
                        >
                          <img src={a.url} alt={a.file_name} className="h-full w-full object-cover" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenAttachment(a)}
                          className="flex h-14 w-14 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
                          title={a.file_name}
                        >
                          <ImageIcon className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await delAttach({ data: { id: a.id } });
                          qc.invalidateQueries({ queryKey: ["note-attachments", note.id] });
                        }}
                        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover/att:flex"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {new Date(note.updated_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
            <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <label className="grid h-6 w-6 cursor-pointer place-items-center rounded text-muted-foreground hover:bg-accent">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                    e.target.value = "";
                  }}
                />
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Paperclip className="h-3 w-3" />
                )}
              </label>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => onPin(note)}
                title={note.pinned ? "Unpin" : "Pin"}
              >
                {note.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={() => onDelete(note.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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
  const recordAttach = useServerFn(recordNoteAttachment);

  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  const queryKey = ["notes", entityType, entityId ?? null, ""];
  const { data: notes = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => list({ data: { entityType, entityId: entityId ?? undefined } }),
    enabled: !!entityId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const createNote = async (text: string): Promise<NoteRow | null> => {
    const t = text.trim();
    if (!t) return null;
    const row = (await save({
      data: {
        title: t.split("\n")[0].slice(0, 80),
        body_text: t,
        body: { text: t },
        tags: [],
        pinned: false,
        visibility: "private",
        entity_type: entityType,
        entity_id: entityId,
      },
    })) as NoteRow;
    return row;
  };

  const handleQuickSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await createNote(draft);
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

  const handleUpdate = async (n: NoteRow, text: string) => {
    const t = text.trim();
    if (!t) return;
    setSaving(true);
    try {
      await save({
        data: {
          id: n.id,
          title: t.split("\n")[0].slice(0, 80),
          body_text: t,
          body: { text: t },
          tags: [],
          pinned: n.pinned,
          visibility: n.visibility,
          entity_type: entityType,
          entity_id: entityId,
        },
      });
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

  const uploadToNewDraft = async (file: File) => {
    try {
      const text = draft.trim() || `Attachment: ${file.name}`;
      const row = await createNote(text);
      if (!row) return;
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const path = `${uid}/${row.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("note-attachments").upload(path, file);
      if (error) throw error;
      await recordAttach({
        data: {
          note_id: row.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      setDraft("");
      setComposing(false);
      invalidate();
      toast.success("Attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const onComposerPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const file = it.getAsFile();
        if (file) {
          e.preventDefault();
          await uploadToNewDraft(file);
          return;
        }
      }
    }
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
          <div
            className="rounded-xl border border-primary/40 bg-background p-2 shadow-sm"
            onPaste={onComposerPaste}
          >
            <AutoTextarea
              value={draft}
              onChange={setDraft}
              autoFocus
              minPx={72}
              placeholder="Quick note… paste images with ⌘V"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleQuickSave();
                }
                if (e.key === "Escape") {
                  setComposing(false);
                  setDraft("");
                }
              }}
            />
            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadToNewDraft(f);
                    e.target.value = "";
                  }}
                />
                <Paperclip className="h-3 w-3" /> attach
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">⌘+Enter</span>
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
                <Button
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleQuickSave}
                  disabled={saving || !draft.trim()}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
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
            <NoteCard
              key={n.id}
              note={n}
              entityType={entityType}
              entityId={entityId}
              saving={saving}
              onSave={handleUpdate}
              onPin={handlePin}
              onDelete={handleDelete}
              onOpenAttachment={(a) => setLightbox(a)}
            />
          ))
        )}
      </div>

      <NoteAttachmentLightbox attachment={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
