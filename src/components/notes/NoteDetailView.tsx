import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  Share2,
  Check,
  Pencil,
  Plus,
  Loader2,
  X,
  FileText,
  Pin,
  PinOff,
  Trash2,
  Eye,
  EyeOff,
  PanelRightOpen,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TagInput } from "@/components/leads/TagInput";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import {
  upsertNote,
  deleteNote,
  togglePinNote,
  summarizeNotes,
  listNoteAttachments,
  recordNoteAttachment,
  deleteNoteAttachment,
} from "@/lib/notes.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { NoteRow } from "./NotesWorkspace";
import { NoteAttachmentLightbox, type Attachment } from "./NoteAttachmentLightbox";
import { NoteMetricsPanel } from "./NoteMetricsPanel";


export function NoteDetailView({ note }: { note: NoteRow }) {
  const qc = useQueryClient();
  const save = useServerFn(upsertNote);
  const del = useServerFn(deleteNote);
  const pin = useServerFn(togglePinNote);
  const summarize = useServerFn(summarizeNotes);
  const listAttach = useServerFn(listNoteAttachments);
  const recordAttach = useServerFn(recordNoteAttachment);
  const delAttach = useServerFn(deleteNoteAttachment);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [bodyText, setBodyText] = useState(note.body_text);
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [visibility, setVisibility] = useState<"private" | "shared">(note.visibility);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [metricsSize, setMetricsSize] = useState<"md" | "lg">(() => {
    if (typeof window === "undefined") return "md";
    return (localStorage.getItem("notes:metricsSize") as "md" | "lg") || "md";
  });
  const [mobileMetricsOpen, setMobileMetricsOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("notes:metricsSize", metricsSize);
    }
  }, [metricsSize]);


  useEffect(() => {
    setTitle(note.title);
    setBodyText(note.body_text);
    setTags(note.tags ?? []);
    setVisibility(note.visibility);
    setEditing(false);
    setSummary(null);
  }, [note.id]);

  const { data: attachments = [] } = useQuery({
    queryKey: ["note-attachments", note.id],
    queryFn: () => listAttach({ data: { noteId: note.id } }),
  });
  const typedAttachments = attachments as Attachment[];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const handleSave = async () => {
    try {
      await save({
        data: {
          id: note.id,
          title: title.trim(),
          body_text: bodyText,
          body: { text: bodyText },
          tags,
          pinned: note.pinned,
          visibility,
          entity_type: "standalone",
          entity_id: null,
        },
      });
      toast.success("Saved");
      invalidate();
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this note?")) return;
    await del({ data: { id: note.id } });
    invalidate();
    toast.success("Deleted");
  };

  const handlePin = async () => {
    await pin({ data: { id: note.id, pinned: !note.pinned } });
    invalidate();
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const r = await summarize({ data: { entityType: "standalone", entityId: null } });
      setSummary(r.summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      setSummarizing(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const path = `${uid}/${note.id}/${Date.now()}-${file.name}`;
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
      toast.success("Attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = async (id: string) => {
    await delAttach({ data: { id } });
    qc.invalidateQueries({ queryKey: ["note-attachments", note.id] });
  };

  const words = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const readMin = Math.max(1, Math.round(words / 220));

  return (
    <div
      key={note.id}
      className="flex flex-1 animate-in fade-in zoom-in-95 duration-300 overflow-hidden"
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/60 px-8">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-muted-foreground">Notes</span>
            <span className="text-muted-foreground">/</span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
              {tags[0] ?? "Standalone"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isMobile ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMobileMetricsOpen(true)}
                title="Note info"
              >
                <PanelRightOpen className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setMetricsSize(metricsSize === "md" ? "lg" : "md")}
                title={metricsSize === "md" ? "Expand metrics panel" : "Shrink metrics panel"}
              >
                {metricsSize === "md" ? (
                  <Maximize2 className="h-4 w-4" />
                ) : (
                  <Minimize2 className="h-4 w-4" />
                )}
              </Button>
            )}

            <Button
              size="sm"
              variant="ghost"
              className="text-primary hover:bg-primary/10"
              onClick={handleSummarize}
              disabled={summarizing}
            >
              {summarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI Summary
            </Button>
            <Button size="sm" variant="ghost" onClick={handlePin} title={note.pinned ? "Unpin" : "Pin to top"}>
              {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </Button>
            {editing ? (
              <Button size="sm" onClick={handleSave}>
                <Check className="h-4 w-4" /> Save
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
              <Share2 className="h-4 w-4" /> Share
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDelete}
              title="Delete note"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-12 py-10">
          <div className="mx-auto max-w-4xl">
            {/* Hero */}
            <div className="mb-10">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                {editing ? (
                  <div className="w-full max-w-xl">
                    <TagInput value={tags} onChange={setTags} placeholder="Add tag…" />
                  </div>
                ) : tags.length > 0 ? (
                  tags.map((t, i) => (
                    <span
                      key={t}
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest",
                        i % 2 === 0
                          ? "bg-primary/10 text-primary"
                          : "bg-accent text-accent-foreground",
                      )}
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Untagged
                  </span>
                )}
              </div>
              {editing ? (
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-auto border-0 bg-transparent px-0 py-2 text-5xl font-extrabold tracking-tight shadow-none focus-visible:ring-0 md:text-5xl"
                  placeholder="Note title"
                />
              ) : (
                <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight md:text-5xl">
                  {title || "Untitled note"}
                </h1>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border/60 pb-6 text-xs">
                <Meta
                  label="Last modified"
                  value={new Date(note.updated_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                />
                <Divider />
                <button
                  type="button"
                  onClick={() => editing && setVisibility(visibility === "private" ? "shared" : "private")}
                  disabled={!editing}
                  className="flex items-center gap-1.5 disabled:cursor-default"
                >
                  {visibility === "shared" ? (
                    <Eye className="h-3.5 w-3.5 text-primary" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <Meta label="Visibility" value={visibility} capitalize />
                </button>
                <Divider />
                <Meta label="Words" value={words.toLocaleString()} />
                <Divider />
                <Meta label="Read time" value={`~${readMin} min`} />
              </div>
            </div>

            {/* AI Summary inline */}
            {summary && (
              <div className="mb-10 relative overflow-hidden rounded-3xl bg-foreground p-6 text-background animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/30 blur-3xl" />
                <div className="relative">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                        AI Insight
                      </span>
                    </div>
                    <button onClick={() => setSummary(null)} className="opacity-60 hover:opacity-100">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed opacity-95">
                    {summary}
                  </pre>
                </div>
              </div>
            )}

            {/* Body */}
            {editing ? (
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Start writing… Use - [ ] for checklist items, > for quotes."
                className="min-h-[300px] resize-none rounded-2xl border-border/60 bg-card/60 font-mono text-sm leading-relaxed"
              />
            ) : (
              <RenderedBody text={bodyText} />
            )}

            {/* Attachments */}
            <div className="mt-14">
              <div className="mb-5 flex items-center justify-between">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Attachments & Sketches
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  {typedAttachments.length} {typedAttachments.length === 1 ? "file" : "files"}
                </span>
              </div>
              <div className="flex flex-wrap gap-4">
                {typedAttachments.map((a) => (
                  <AttachmentTile
                    key={a.id}
                    attachment={a}
                    onOpen={() => setLightbox(a)}
                    onRemove={() => handleRemoveAttachment(a.id)}
                  />
                ))}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-28 w-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-muted-foreground transition-all hover:border-primary hover:bg-primary/5 hover:text-primary"
                >
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-6 w-6" />}
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {uploading ? "Uploading" : "Add Media"}
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isMobile && (
        <div
          className={cn(
            "hidden shrink-0 border-l border-border/60 lg:block",
            metricsSize === "md" ? "w-80" : "w-[480px]",
          )}
        >
          <div className="sticky top-0 h-[calc(100vh-6rem)] overflow-hidden">
            <NoteMetricsPanel
              note={note}
              editing={editing}
              tags={tags}
              visibility={visibility}
              onTagsChange={setTags}
              onVisibilityChange={setVisibility}
              onTogglePin={handlePin}
              onDelete={handleDelete}
              onSummarize={handleSummarize}
              summarizing={summarizing}
              summary={summary}
              onClearSummary={() => setSummary(null)}
            />
          </div>
        </div>
      )}

      <Sheet open={mobileMetricsOpen} onOpenChange={setMobileMetricsOpen}>
        <SheetContent side="right" className="w-[90vw] max-w-sm p-0">
          <SheetTitle className="sr-only">Note details</SheetTitle>
          <NoteMetricsPanel
            note={note}
            editing={editing}
            tags={tags}
            visibility={visibility}
            onTagsChange={setTags}
            onVisibilityChange={setVisibility}
            onTogglePin={handlePin}
            onDelete={handleDelete}
            onSummarize={handleSummarize}
            summarizing={summarizing}
            summary={summary}
            onClearSummary={() => setSummary(null)}
          />
        </SheetContent>
      </Sheet>

      <NoteAttachmentLightbox attachment={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}


function Meta({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div>
      <div className={cn("font-bold", capitalize && "capitalize")}>{value}</div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-border" />;
}

function AttachmentTile({
  attachment,
  onOpen,
  onRemove,
}: {
  attachment: Attachment;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const isImage = attachment.mime_type?.startsWith("image/");
  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className="block h-28 w-36 overflow-hidden rounded-2xl border border-border bg-muted shadow-sm transition-all hover:scale-105 hover:shadow-xl"
      >
        {isImage && attachment.url ? (
          <img
            src={attachment.url}
            alt={attachment.file_name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
            <FileText className="h-6 w-6" />
            <span className="line-clamp-2 text-[10px] font-medium text-center">
              {attachment.file_name}
            </span>
          </div>
        )}
      </button>
      <button
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md group-hover:flex"
        aria-label="Remove attachment"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function RenderedBody({ text }: { text: string }) {
  if (!text.trim()) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Empty note. Click Edit to start writing.
      </p>
    );
  }
  const lines = text.split("\n");
  const blocks: Array<{ type: "p" | "quote" | "check"; checked?: boolean; content: string }> = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ type: "p", content: "" });
      continue;
    }
    const checkMatch = line.match(/^\s*-\s*\[( |x|X)\]\s*(.*)$/);
    if (checkMatch) {
      blocks.push({
        type: "check",
        checked: checkMatch[1].toLowerCase() === "x",
        content: checkMatch[2],
      });
      continue;
    }
    if (line.startsWith("> ")) {
      blocks.push({ type: "quote", content: line.slice(2) });
      continue;
    }
    blocks.push({ type: "p", content: line });
  }
  const merged: Array<{ type: "p" | "quote" | "check" | "spacer"; checked?: boolean; content: string }> = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      merged.push({ type: "p", content: buffer });
      buffer = "";
    }
  };
  for (const b of blocks) {
    if (b.type === "p") {
      if (b.content === "") {
        flush();
      } else {
        buffer = buffer ? buffer + "\n" + b.content : b.content;
      }
    } else {
      flush();
      merged.push(b);
    }
  }
  flush();

  return (
    <article className="space-y-5 text-[17px] leading-relaxed text-foreground/85">
      {merged.map((b, i) => {
        if (b.type === "quote") {
          return (
            <blockquote
              key={i}
              className="rounded-r-3xl border-l-4 border-primary bg-primary/5 p-6 text-xl font-medium italic leading-relaxed text-foreground"
            >
              {b.content}
            </blockquote>
          );
        }
        if (b.type === "check") {
          return (
            <label
              key={i}
              className="flex items-start gap-3 rounded-lg px-2 py-1 hover:bg-muted/50"
            >
              <span
                className={cn(
                  "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
                  b.checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40",
                )}
              >
                {b.checked && <Check className="h-3 w-3" />}
              </span>
              <span className={cn(b.checked && "text-muted-foreground line-through")}>
                {b.content}
              </span>
            </label>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {b.content}
          </p>
        );
      })}
      {merged.length === 0 && <Badge variant="outline">Empty</Badge>}
    </article>
  );
}
