import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { notify } from "@/lib/notifications.server";

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
      // Visibility is enforced by RLS: your own reminders (any type) PLUS
      // reminders on a LEAD you can access (assignee / owner / manager), so a
      // follow-up set on a shared lead shows for both people. Personal
      // ('general') and prospect reminders stay private to their owner. We no
      // longer filter by user_id here — that would hide the shared ones.
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

    // If this reminder is on a lead assigned to someone else, tell them now so
    // they know a follow-up/meeting was scheduled (the reminder itself is
    // already shared and will flash for them at remind_at via RLS).
    if (data.entity_type === "lead" && data.entity_id) {
      const { data: lead } = await context.supabase
        .from("leads")
        .select("assigned_to, company_name, companies!leads_company_id_fkey(name)")
        .eq("id", data.entity_id)
        .single();
      const assignedTo = (lead as { assigned_to?: string | null } | null)?.assigned_to ?? null;
      if (assignedTo && assignedTo !== context.userId) {
        const name =
          (lead as { company_name?: string | null })?.company_name ||
          (lead as { companies?: { name?: string | null } | null })?.companies?.name ||
          data.entity_label ||
          "a lead";
        const when = new Date(data.remind_at).toLocaleString();
        await notify([
          {
            user_id: assignedTo,
            actor_id: context.userId,
            type: "reminder",
            title: `Follow-up scheduled: ${data.title}`,
            body: `${name} · ${when}`,
            lead_id: data.entity_id,
          },
        ]);
      }
    }
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
