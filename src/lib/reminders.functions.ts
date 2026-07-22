import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entityTypeEnum = z.enum(["lead", "prospect", "general"]);

const REMINDER_SELECT =
  "id, title, note, remind_at, entity_type, entity_id, entity_label, status, created_at, updated_at";

// Active reminders (pending) plus recently completed ones for the panel.
export const listReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reminders")
      .select(REMINDER_SELECT)
      .neq("status", "dismissed")
      .order("remind_at", { ascending: true })
      .limit(200);
    // Before the reminders migration runs, the table won't exist — degrade to
    // an empty list instead of spamming errors on the 30s poll.
    if (error) {
      if (/reminders|does not exist|relation/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return data ?? [];
  });

export const createReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(200),
        note: z.string().trim().max(1000).nullable().optional(),
        remind_at: z.string().datetime({ offset: true }),
        entity_type: entityTypeEnum.default("general"),
        entity_id: z.string().uuid().nullable().optional(),
        entity_label: z.string().trim().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("reminders")
      .insert({
        user_id: context.userId,
        title: data.title,
        note: data.note ?? null,
        remind_at: data.remind_at,
        entity_type: data.entity_type,
        entity_id: data.entity_id ?? null,
        entity_label: data.entity_label ?? null,
        status: "pending",
      })
      .select(REMINDER_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setReminderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "done", "dismissed"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("reminders")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Snooze: push the reminder out by N minutes and keep it pending.
export const snoozeReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), minutes: z.number().int().min(1).max(60 * 24 * 30) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const next = new Date(Date.now() + data.minutes * 60_000).toISOString();
    const { error } = await context.supabase
      .from("reminders")
      .update({ remind_at: next, status: "pending", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, remind_at: next };
  });

export const deleteReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("reminders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
