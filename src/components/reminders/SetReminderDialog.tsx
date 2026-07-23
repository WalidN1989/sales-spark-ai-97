// Create a reminder for a specific date + time, linked to a lead or prospect.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlarmClock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createReminder } from "@/lib/reminders.functions";
import { weekdayLabel } from "@/lib/leads-command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type ReminderEntity = { type: "lead" | "prospect" | "general"; id: string | null; label: string | null };

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function timeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SetReminderDialog({
  open,
  onClose,
  entity,
  defaultTitle,
}: {
  open: boolean;
  onClose: () => void;
  entity: ReminderEntity;
  defaultTitle?: string;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createReminder);

  const [title, setTitle] = useState(defaultTitle ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");

  // Default to one hour from now whenever the dialog opens.
  useEffect(() => {
    if (open) {
      const d = new Date(Date.now() + 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      setTitle(defaultTitle ?? (entity.label ? `Follow up — ${entity.label}` : ""));
      setDate(dateStr(d));
      setTime(timeStr(d));
      setNote("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (fn: (d: Date) => void) => {
    const d = new Date();
    fn(d);
    setDate(dateStr(d));
    setTime(timeStr(d));
  };

  const create = useMutation({
    mutationFn: () => {
      const when = new Date(`${date}T${time}`);
      if (isNaN(when.getTime())) throw new Error("Pick a valid date and time");
      return createFn({
        data: {
          title: title.trim(),
          note: note.trim() || null,
          remind_at: when.toISOString(),
          entity_type: entity.type,
          entity_id: entity.id,
          entity_label: entity.label,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reminders"] });
      toast.success("Reminder set");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const presets: { label: string; fn: (d: Date) => void }[] = [
    { label: "In 1 hour", fn: (d) => d.setHours(d.getHours() + 1, 0, 0, 0) },
    { label: "In 3 hours", fn: (d) => d.setHours(d.getHours() + 3, 0, 0, 0) },
    { label: "Tomorrow 9 AM", fn: (d) => { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); } },
    { label: "Next week", fn: (d) => { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); } },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlarmClock className="h-5 w-5 text-primary" /> Set a reminder
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Call procurement about the quote" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Time</label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {date && (
            <p className="-mt-1 text-xs font-medium text-muted-foreground">
              {weekdayLabel(date)}
              {time ? ` · ${time}` : ""}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.fn)}
                className="rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Note <span className="font-normal normal-case">(optional)</span>
            </label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Anything to remember for this follow-up…" />
          </div>

          {entity.label && (
            <div className={cn("rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground")}>
              Linked to <span className="font-medium text-foreground">{entity.label}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!title.trim() || !date || !time || create.isPending}>
            {create.isPending ? "Setting…" : "Set reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
