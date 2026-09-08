import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Flag, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { useAccess } from "@/hooks/use-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { listTasks, createTask, updateTask, deleteTask, type Task } from "@/lib/tasks.functions";
import { listTeamMembers, type TeamMember } from "@/lib/leads.functions";

export const Route = createFileRoute("/_authenticated/app/tasks")({
  head: () => ({ meta: [{ title: "Tasks — Sales Insights" }] }),
  component: TasksPage,
});

const PRIORITY_FLAG: Record<Task["priority"], string> = {
  high: "text-rose-500",
  medium: "text-amber-500",
  low: "text-slate-400",
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function dueLabel(due: string | null): { text: string; tone: string } {
  if (!due) return { text: "—", tone: "text-muted-foreground/50" };
  const today = todayISO();
  const d = new Date(due + "T00:00:00");
  const nice = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (due < today) return { text: nice, tone: "text-rose-600 font-medium" };
  if (due === today) return { text: "Today", tone: "text-amber-600 font-medium" };
  return { text: nice, tone: "text-foreground" };
}

type QuickFilter = "all" | "open" | "done" | "overdue";

function TasksPage() {
  const qc = useQueryClient();
  const { isManager } = useAccess();
  const listFn = useServerFn(listTasks);
  const membersFn = useServerFn(listTeamMembers);
  const createFn = useServerFn(createTask);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: () => listFn(),
  });
  const { data: members = [] } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: () => membersFn(),
    enabled: isManager,
    staleTime: 60_000,
  });
  const memberName = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of members) m.set(x.id, x.full_name || x.email || "Member");
    return m;
  }, [members]);

  const [quick, setQuick] = useState<QuickFilter>("open");
  const [assignee, setAssignee] = useState<string>("all");

  const refresh = () => qc.invalidateQueries({ queryKey: ["tasks"] });

  const toggle = useMutation({
    mutationFn: (t: Task) => updateFn({ data: { id: t.id, patch: { status: t.status === "done" ? "open" : "done" } } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Task deleted");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = todayISO();
  const rows = useMemo(() => {
    let out = tasks;
    if (quick === "open") out = out.filter((t) => t.status === "open");
    else if (quick === "done") out = out.filter((t) => t.status === "done");
    else if (quick === "overdue") out = out.filter((t) => t.status === "open" && t.due_date && t.due_date < today);
    if (isManager && assignee !== "all") out = out.filter((t) => (t.assigned_to ?? "") === assignee);
    return out;
  }, [tasks, quick, assignee, isManager, today]);

  const counts = useMemo(() => {
    const open = tasks.filter((t) => t.status === "open");
    return {
      open: open.length,
      overdue: open.filter((t) => t.due_date && t.due_date < today).length,
      done: tasks.filter((t) => t.status === "done").length,
    };
  }, [tasks, today]);

  return (
    <div className="space-y-4">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="shrink-0 text-lg font-bold tracking-tight">Tasks</h1>
          <span className="text-xs text-muted-foreground">
            {counts.open} open{counts.overdue > 0 ? ` · ${counts.overdue} overdue` : ""}
          </span>
          <div className="ml-auto">
            <NewTaskDialog isManager={isManager} members={members} onCreated={refresh} createFn={createFn} />
          </div>
        </div>
      </HeaderPortal>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["open", `Open ${counts.open}`],
            ["overdue", `Overdue ${counts.overdue}`],
            ["done", `Done ${counts.done}`],
            ["all", "All"],
          ] as [QuickFilter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setQuick(key)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              quick === key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
        {isManager && members.length > 0 && (
          <div className="ml-2 w-48">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Anyone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {quick === "done" ? "No completed tasks yet." : "No tasks here. Create one with “New task”."}
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((t) => {
              const due = dueLabel(t.due_date);
              const done = t.status === "done";
              return (
                <li key={t.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent/30">
                  <button
                    type="button"
                    title={done ? "Mark open" : "Mark done"}
                    onClick={() => toggle.mutate(t)}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600"
                  >
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}>
                      {t.title}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {(t.company_name || t.lead_id) &&
                        (t.lead_id ? (
                          <Link to="/app/leads/$id" params={{ id: t.lead_id }} className="hover:underline">
                            {t.company_name || "View lead"}
                          </Link>
                        ) : (
                          <span>{t.company_name}</span>
                        ))}
                      {isManager && t.assigned_to && (
                        <span className="rounded bg-secondary px-1.5 py-0.5">{memberName.get(t.assigned_to) ?? "Member"}</span>
                      )}
                      {t.notes && <span className="truncate">· {t.notes}</span>}
                    </div>
                  </div>
                  <Flag className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${PRIORITY_FLAG[t.priority]}`} fill="currentColor" />
                  <span className={`mt-0.5 w-16 shrink-0 text-right text-xs ${due.tone}`}>{due.text}</span>
                  <button
                    type="button"
                    title="Delete task"
                    onClick={() => remove.mutate(t.id)}
                    className="mt-0.5 shrink-0 text-muted-foreground/50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function NewTaskDialog({
  isManager,
  members,
  onCreated,
  createFn,
}: {
  isManager: boolean;
  members: TeamMember[];
  onCreated: () => void;
  createFn: ReturnType<typeof useServerFn<typeof createTask>>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [company, setCompany] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [assignee, setAssignee] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setNotes("");
    setCompany("");
    setDue("");
    setPriority("medium");
    setAssignee("");
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("Give the task a title");
    setBusy(true);
    try {
      await createFn({
        data: {
          title: title.trim(),
          notes: notes.trim() || undefined,
          company_name: company.trim() || undefined,
          due_date: due || undefined,
          priority,
          assigned_to: isManager && assignee ? assignee : undefined,
        },
      });
      toast.success("Task created");
      onCreated();
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create task");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" /> New task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Task</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Call Techsys about the PDC" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} placeholder="Optional details" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={200} placeholder="Optional" />
            </div>
            <div>
              <Label>Due date</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div className={`grid gap-3 ${isManager && members.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isManager && members.length > 0 && (
              <div>
                <Label>Assign to</Label>
                <Select value={assignee || "me"} onValueChange={(v) => setAssignee(v === "me" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me">Myself</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy}>
            {busy ? "Creating…" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
