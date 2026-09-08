import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listNotes, upsertNote } from "@/lib/notes.functions";
import { listTeamMembers, type TeamMember } from "@/lib/leads.functions";
import { useAccess } from "@/hooks/use-access";
import { NoteListRail } from "./NoteListRail";
import { NoteDetailView } from "./NoteDetailView";
import { toast } from "sonner";

export type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  body: unknown;
  body_text: string;
  tags: string[];
  pinned: boolean;
  visibility: "private" | "shared";
  entity_type: "prospect" | "lead" | "sale" | "meeting" | "standalone";
  entity_id: string | null;
  created_at: string;
  updated_at: string;
};

export function NotesWorkspace() {
  const qc = useQueryClient();
  const list = useServerFn(listNotes);
  const save = useServerFn(upsertNote);
  const membersFn = useServerFn(listTeamMembers);
  const { isManager, userId } = useAccess();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [owner, setOwner] = useState<string>("mine");

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["notes", "standalone", null, search],
    queryFn: () =>
      list({ data: { entityType: "standalone", search: search || undefined } }),
  });
  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: () => membersFn(),
    enabled: isManager,
    staleTime: 60_000,
  });

  const all = notes as NoteRow[];
  const typed = useMemo(() => {
    if (!isManager || owner === "all") return all;
    if (owner === "mine") return userId ? all.filter((n) => n.user_id === userId) : all;
    return all.filter((n) => n.user_id === owner);
  }, [all, isManager, owner, userId]);
  const selected = useMemo(
    () => typed.find((n) => n.id === selectedId) ?? typed[0] ?? null,
    [typed, selectedId],
  );

  const handleNew = async () => {
    try {
      const row = (await save({
        data: {
          title: "Untitled note",
          body_text: "",
          body: { text: "" },
          tags: [],
          pinned: false,
          visibility: "private",
          entity_type: "standalone",
          entity_id: null,
        },
      })) as NoteRow;
      await qc.invalidateQueries({ queryKey: ["notes"] });
      setSelectedId(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-xl shadow-foreground/5 backdrop-blur-xl">
      <NoteListRail
        notes={typed}
        loading={isLoading}
        search={search}
        onSearch={setSearch}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
        onNew={handleNew}
        filterSlot={
          isManager && members.length > 0 ? (
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="h-9 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">My notes</SelectItem>
                <SelectItem value="all">Everyone</SelectItem>
                {members
                  .filter((m) => m.id !== userId)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name || m.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col bg-background/40">
        {selected ? (
          <NoteDetailView key={selected.id} note={selected} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-12 text-center">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">No note selected</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Pick a note from the left, or start a new one.
              </p>
              <Button onClick={handleNew} className="mt-6">
                <Plus className="h-4 w-4" /> New note
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
