import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { Pin, PinOff, Trash2, Sparkles, Loader2, Paperclip, X, Plus, Search, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/leads/TagInput";
import { supabase } from "@/integrations/supabase/client";
import {
  listNotes,
  upsertNote,
  deleteNote,
  togglePinNote,
  summarizeNotes,
  listNoteAttachments,
  recordNoteAttachment,
  deleteNoteAttachment,
} from "@/lib/notes.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type EntityType = "prospect" | "lead" | "sale" | "meeting" | "standalone";

type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  body: unknown;
  body_text: string;
  tags: string[];
  pinned: boolean;
  visibility: "private" | "shared";
  entity_type: EntityType;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
};

export function NotesPanel({
  entityType,
  entityId,
  compact = false,
}: {
  entityType: EntityType;
  entityId?: string | null;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listNotes);
  const save = useServerFn(upsertNote);
  const del = useServerFn(deleteNote);
  const pin = useServerFn(togglePinNote);
  const summarize = useServerFn(summarizeNotes);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<NoteRow> | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const queryKey = ["notes", entityType, entityId ?? null, search];
  const { data: notes = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      list({
        data: {
          entityType,
          entityId: entityId ?? undefined,
          search: search || undefined,
        },
      }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const handleSave = async () => {
    if (!editing) return;
    const title = (editing.title ?? "").trim();
    const body_text = (editing.body_text ?? "").trim();
    if (!title && !body_text) {
      toast.error("Note is empty");
      return;
    }
    try {
      await save({
        data: {
          id: editing.id,
          title,
          body_text,
          body: { text: body_text },
          tags: editing.tags ?? [],
          pinned: editing.pinned ?? false,
          visibility: editing.visibility ?? "private",
          entity_type: entityType,
          entity_id: entityId ?? null,
        },
      });
      toast.success(editing.id ? "Note updated" : "Note added");
      setEditing(null);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    await del({ data: { id } });
    invalidate();
    toast.success("Deleted");
  };

  const handlePin = async (n: NoteRow) => {
    await pin({ data: { id: n.id, pinned: !n.pinned } });
    invalidate();
  };

  const handleSummarize = async () => {
    setSummarizing(true);
    setSummary(null);
    try {
      const res = await summarize({ data: { entityType, entityId: entityId ?? null } });
      setSummary(res.summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="pl-7 h-8"
          />
        </div>
        <Button size="sm" variant="outline" onClick={handleSummarize} disabled={summarizing || notes.length === 0}>
          {summarizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          AI summary
        </Button>
        <Button size="sm" onClick={() => setEditing({ visibility: "private", tags: [], pinned: false })}>
          <Plus className="h-4 w-4" /> New note
        </Button>
      </div>

      {summary && (
        <Card>
          <CardContent className="prose prose-sm max-w-none pt-4 dark:prose-invert">
            <div className="mb-2 flex items-center justify-between">
              <Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" /> AI summary</Badge>
              <Button variant="ghost" size="sm" onClick={() => setSummary(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm">{summary}</pre>
          </CardContent>
        </Card>
      )}

      {editing && (
        <NoteEditor
          value={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <div className={cn("grid gap-2", compact ? "" : "sm:grid-cols-2")}>
          {(notes as NoteRow[]).map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              onEdit={() => setEditing(n)}
              onPin={() => handlePin(n)}
              onDelete={() => handleDelete(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onEdit,
  onPin,
  onDelete,
}: {
  note: NoteRow;
  onEdit: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={cn(note.pinned && "border-primary/40")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <button onClick={onEdit} className="flex-1 text-left">
            <div className="font-medium leading-tight">{note.title || "(untitled)"}</div>
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{note.body_text}</p>
          </button>
          <div className="flex shrink-0 flex-col gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPin}>
              {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {note.visibility === "shared" ? (
            <Badge variant="secondary" className="text-xs"><Eye className="mr-1 h-3 w-3" /> Shared</Badge>
          ) : (
            <Badge variant="outline" className="text-xs"><EyeOff className="mr-1 h-3 w-3" /> Private</Badge>
          )}
          {note.tags?.map((t) => (
            <Badge key={t} variant="outline" className="text-xs">#{t}</Badge>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(note.updated_at).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function NoteEditor({
  value,
  onChange,
  onCancel,
  onSave,
}: {
  value: Partial<NoteRow>;
  onChange: (n: Partial<NoteRow>) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const noteId = value.id;
  const qc = useQueryClient();
  const listAttach = useServerFn(listNoteAttachments);
  const recordAttach = useServerFn(recordNoteAttachment);
  const delAttach = useServerFn(deleteNoteAttachment);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: attachments = [] } = useQuery({
    queryKey: ["note-attachments", noteId],
    queryFn: () => listAttach({ data: { noteId: noteId! } }),
    enabled: !!noteId,
  });

  const handleUpload = async (file: File) => {
    if (!noteId) {
      toast.error("Save the note first to attach files");
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not authenticated");
      const path = `${uid}/${noteId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("note-attachments").upload(path, file);
      if (error) throw error;
      await recordAttach({
        data: {
          note_id: noteId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      qc.invalidateQueries({ queryKey: ["note-attachments", noteId] });
      toast.success("Attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Input
          value={value.title ?? ""}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          placeholder="Title"
        />
        <Textarea
          value={value.body_text ?? ""}
          onChange={(e) => onChange({ ...value, body_text: e.target.value })}
          placeholder="Write your note. Use - [ ] for checklist items."
          className="min-h-[140px] font-mono text-sm"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Tags</label>
            <TagInput
              value={value.tags ?? []}
              onChange={(tags) => onChange({ ...value, tags })}
              placeholder="Add tag…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Visibility</label>
            <Select
              value={value.visibility ?? "private"}
              onValueChange={(v) => onChange({ ...value, visibility: v as "private" | "shared" })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private (only me)</SelectItem>
                <SelectItem value="shared">Shared with team</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {noteId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Attachments</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                Attach file
              </Button>
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
            {attachments.length > 0 && (
              <ul className="space-y-1">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded border px-2 py-1 text-xs">
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                        {a.file_name}
                      </a>
                    ) : (
                      <span className="truncate">{a.file_name}</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={async () => {
                        await delAttach({ data: { id: a.id } });
                        qc.invalidateQueries({ queryKey: ["note-attachments", noteId] });
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onSave}><Save className="h-4 w-4" /> Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
