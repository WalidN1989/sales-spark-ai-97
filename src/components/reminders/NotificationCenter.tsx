// Reminders / notification center: a header bell with a badge, a stacked
// notification panel, and a center-screen popup that fires when a reminder's
// time arrives (blurred backdrop, Snooze / View / Dismiss). Clicking a reminder
// navigates to its linked lead or prospect. Pending reminders stay in the bell
// until acted on, so a deferred popup is always recoverable.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlarmClock,
  Bell,
  BellRing,
  Building2,
  Check,
  Clock,
  Flame,
  Trash2,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  listReminders,
  setReminderStatus,
  snoozeReminder,
  deleteReminder,
} from "@/lib/reminders.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type Reminder = {
  id: string;
  title: string;
  note: string | null;
  remind_at: string;
  entity_type: "lead" | "prospect" | "general";
  entity_id: string | null;
  entity_label: string | null;
  status: "pending" | "done" | "dismissed";
  created_at: string;
  updated_at: string;
};

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  if (sameDay) return `Today, ${time}`;
  if (isTomorrow) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

function relative(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const past = diff < 0;
  const m = Math.round(Math.abs(diff) / 60000);
  if (m < 1) return "now";
  if (m < 60) return past ? `${m}m ago` : `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return past ? `${h}h ago` : `in ${h}h`;
  const day = Math.round(h / 24);
  return past ? `${day}d ago` : `in ${day}d`;
}

function EntityIcon({ type }: { type: Reminder["entity_type"] }) {
  if (type === "lead") return <Flame className="h-3.5 w-3.5 text-orange-500" />;
  if (type === "prospect") return <Building2 className="h-3.5 w-3.5 text-sky-500" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listReminders);
  const setStatusFn = useServerFn(setReminderStatus);
  const snoozeFn = useServerFn(snoozeReminder);
  const delFn = useServerFn(deleteReminder);

  const { data: reminders = [] } = useQuery({
    queryKey: ["reminders"],
    queryFn: () => listFn() as Promise<Reminder[]>,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Tick a clock (client-only) so due detection and relative labels update.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // Ask for OS notification permission once (optional enhancement).
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const pending = useMemo(() => reminders.filter((r) => r.status === "pending"), [reminders]);
  const due = useMemo(
    () => pending.filter((r) => new Date(r.remind_at).getTime() <= now),
    [pending, now],
  );
  const upcoming = useMemo(
    () => pending.filter((r) => new Date(r.remind_at).getTime() > now),
    [pending, now],
  );
  const doneRecent = useMemo(
    () => reminders.filter((r) => r.status === "done").slice(0, 5),
    [reminders],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reminders"] });

  const snooze = useMutation({
    mutationFn: (v: { id: string; minutes: number }) => snoozeFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });
  const mark = useMutation({
    mutationFn: (v: { id: string; status: "done" | "dismissed" | "pending" }) => setStatusFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);

  // ---- Center popup ----
  const poppedRef = useRef<Set<string>>(new Set());
  const [popup, setPopup] = useState<Reminder | null>(null);
  useEffect(() => {
    if (popup || now === 0) return;
    const next = pending.find(
      (r) => new Date(r.remind_at).getTime() <= now && !poppedRef.current.has(r.id),
    );
    if (next) {
      poppedRef.current.add(next.id);
      setPopup(next);
      // Best-effort OS notification too.
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification(`Reminder: ${next.title}`, {
            body: next.entity_label ? `${next.entity_label} · ${whenLabel(next.remind_at)}` : whenLabel(next.remind_at),
          });
        } catch { /* ignore */ }
      }
    }
  }, [pending, now, popup]);

  const goTo = (r: Reminder) => {
    if (r.entity_type === "lead" && r.entity_id) navigate({ to: "/app/leads/$id", params: { id: r.entity_id } });
    else if (r.entity_type === "prospect" && r.entity_id) navigate({ to: "/app/prospects/$id", params: { id: r.entity_id } });
  };

  const badge = due.length;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Reminders"
            aria-label="Reminders"
          >
            {badge > 0 ? <BellRing className="h-5 w-5 text-foreground" /> : <Bell className="h-5 w-5" />}
            {badge > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-card">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] p-0">
          <div className="flex items-center justify-between border-b px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4" /> Notifications
            </div>
            {pending.length > 0 && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                {pending.length} pending
              </span>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {pending.length === 0 && doneRecent.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <Bell className="mx-auto mb-2 h-6 w-6 opacity-40" />
                You&apos;re all caught up.
              </div>
            ) : (
              <>
                {due.length > 0 && (
                  <Group label="Due now">
                    {due.map((r) => (
                      <Item
                        key={r.id}
                        r={r}
                        now={now}
                        tone="due"
                        onOpen={() => {
                          goTo(r);
                          setOpen(false);
                        }}
                        onSnooze={() => snooze.mutate({ id: r.id, minutes: 5 })}
                        onDone={() => mark.mutate({ id: r.id, status: "done" })}
                        onDelete={() => remove.mutate(r.id)}
                      />
                    ))}
                  </Group>
                )}
                {upcoming.length > 0 && (
                  <Group label="Upcoming">
                    {upcoming.map((r) => (
                      <Item
                        key={r.id}
                        r={r}
                        now={now}
                        tone="upcoming"
                        onOpen={() => {
                          goTo(r);
                          setOpen(false);
                        }}
                        onSnooze={() => snooze.mutate({ id: r.id, minutes: 5 })}
                        onDone={() => mark.mutate({ id: r.id, status: "done" })}
                        onDelete={() => remove.mutate(r.id)}
                      />
                    ))}
                  </Group>
                )}
                {doneRecent.length > 0 && (
                  <Group label="Done">
                    {doneRecent.map((r) => (
                      <Item
                        key={r.id}
                        r={r}
                        now={now}
                        tone="done"
                        onOpen={() => {
                          goTo(r);
                          setOpen(false);
                        }}
                        onDelete={() => remove.mutate(r.id)}
                      />
                    ))}
                  </Group>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Center popup */}
      {popup && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/40 p-4 backdrop-blur-sm"
          onClick={() => setPopup(null)}
        >
          <div
            className="w-full max-w-md animate-in fade-in zoom-in-95 rounded-2xl border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex flex-col items-center text-center">
              <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
                <AlarmClock className="h-7 w-7" />
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Reminder</div>
              <h2 className="mt-0.5 text-xl font-bold">{popup.title}</h2>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> {whenLabel(popup.remind_at)}
              </div>
            </div>

            {(popup.entity_label || popup.note) && (
              <div className="mb-5 space-y-2 rounded-xl border bg-muted/40 p-3 text-sm">
                {popup.entity_label && (
                  <button
                    type="button"
                    onClick={() => {
                      goTo(popup);
                      setPopup(null);
                    }}
                    className="flex w-full items-center gap-2 font-medium text-primary hover:underline"
                  >
                    <EntityIcon type={popup.entity_type} />
                    <span className="truncate">{popup.entity_label}</span>
                  </button>
                )}
                {popup.note && <p className="text-muted-foreground">{popup.note}</p>}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  snooze.mutate({ id: popup.id, minutes: 5 });
                  setPopup(null);
                }}
              >
                <AlarmClock className="mr-1 h-4 w-4" /> Snooze
              </Button>
              <Button
                onClick={() => {
                  goTo(popup);
                  setPopup(null);
                }}
              >
                Open
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  mark.mutate({ id: popup.id, status: "done" });
                  setPopup(null);
                }}
              >
                <Check className="mr-1 h-4 w-4" /> Done
              </Button>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Click outside to keep it in the bell
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-card/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Item({
  r,
  now,
  tone,
  onOpen,
  onSnooze,
  onDone,
  onDelete,
}: {
  r: Reminder;
  now: number;
  tone: "due" | "upcoming" | "done";
  onOpen: () => void;
  onSnooze?: () => void;
  onDone?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex cursor-pointer gap-2.5 border-b px-3 py-2.5 transition-colors hover:bg-accent/60",
        tone === "due" && "bg-rose-50/50 dark:bg-rose-950/20",
        tone === "done" && "opacity-60",
      )}
      onClick={onOpen}
    >
      <div className="mt-0.5">
        <EntityIcon type={r.entity_type} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className={cn("truncate text-sm font-medium", tone === "done" && "line-through")}>{r.title}</div>
          <span
            className={cn(
              "shrink-0 text-[11px]",
              tone === "due" ? "font-semibold text-rose-600" : "text-muted-foreground",
            )}
          >
            {relative(r.remind_at, now)}
          </span>
        </div>
        {r.entity_label && <div className="truncate text-xs text-muted-foreground">{r.entity_label}</div>}
        {r.note && <div className="truncate text-xs text-muted-foreground/80">{r.note}</div>}
        <div className="mt-1 hidden items-center gap-1 group-hover:flex" onClick={(e) => e.stopPropagation()}>
          {onSnooze && (
            <button type="button" onClick={onSnooze} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground" title="Snooze 5 min">
              <AlarmClock className="mr-0.5 inline h-3 w-3" /> 5m
            </button>
          )}
          {onDone && (
            <button type="button" onClick={onDone} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-emerald-600" title="Mark done">
              <Check className="mr-0.5 inline h-3 w-3" /> Done
            </button>
          )}
          <button type="button" onClick={onDelete} className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-rose-600" title="Delete">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
