import { Plus, Search, Pin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NoteListCard } from "./NoteListCard";
import type { NoteRow } from "./NotesWorkspace";

export function NoteListRail({
  notes,
  loading,
  search,
  onSearch,
  selectedId,
  onSelect,
  onNew,
}: {
  notes: NoteRow[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const pinned = notes.filter((n) => n.pinned);
  const rest = notes.filter((n) => !n.pinned);

  return (
    <aside className="flex w-96 shrink-0 flex-col border-r border-border/60 bg-muted/30">
      <div className="p-6 pb-3">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-extrabold tracking-tight">Notes</h2>
          <Button size="icon" onClick={onNew} className="h-10 w-10 rounded-full shadow-lg">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search your notes…"
            className="h-11 rounded-2xl border-border/60 bg-background pl-9"
          />
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <>
            {pinned.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-2 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <Pin className="h-3 w-3" /> Pinned
                </div>
                {pinned.map((n) => (
                  <NoteListCard
                    key={n.id}
                    note={n}
                    active={n.id === selectedId}
                    onClick={() => onSelect(n.id)}
                  />
                ))}
                {rest.length > 0 && (
                  <div className="px-2 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    All notes
                  </div>
                )}
              </>
            )}
            {rest.map((n) => (
              <NoteListCard
                key={n.id}
                note={n}
                active={n.id === selectedId}
                onClick={() => onSelect(n.id)}
              />
            ))}
          </>
        )}
      </div>
    </aside>
  );
}
