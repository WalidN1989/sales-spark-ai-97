import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  lead_id: string | null;
  company_name: string | null;
  assigned_to: string | null;
  created_by: string;
  due_date: string | null;
  status: "open" | "done";
  priority: "low" | "medium" | "high";
  created_at: string;
  completed_at: string | null;
};

const TASK_SELECT =
  "id, title, notes, lead_id, company_name, assigned_to, created_by, due_date, status, priority, created_at, completed_at";

// RLS scopes rows: a rep gets their own tasks, a manager gets everyone's.
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Task[]> => {
    // tasks isn't in the generated types until Lovable regenerates them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("tasks")
      .select(TASK_SELECT)
      .order("status", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      if (/tasks|does not exist|relation/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as Task[];
  });

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
  .nullable()
  .optional();

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  company_name: z.string().trim().max(200).nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  due_date: dateStr,
  priority: z.enum(["low", "medium", "high"]).optional(),
});

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ context, data }) => {
    const row = {
      title: data.title,
      notes: data.notes ?? null,
      lead_id: data.lead_id ?? null,
      company_name: data.company_name ?? null,
      assigned_to: data.assigned_to ?? context.userId, // default to yourself
      created_by: context.userId,
      due_date: data.due_date ?? null,
      priority: data.priority ?? "medium",
      status: "open",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data: created, error } = await sb.from("tasks").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id as string };
  });

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(["open", "done"]).optional(),
    due_date: dateStr,
    assigned_to: z.string().uuid().nullable().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    company_name: z.string().trim().max(200).nullable().optional(),
    lead_id: z.string().uuid().nullable().optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "Empty patch");

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), patch: patchSchema }).parse(d))
  .handler(async ({ context, data }) => {
    const patch: Record<string, unknown> = { ...data.patch };
    if (data.patch.status) {
      patch.completed_at = data.patch.status === "done" ? new Date().toISOString() : null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb.from("tasks").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { error } = await sb.from("tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
