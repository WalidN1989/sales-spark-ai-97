import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CATEGORIES = ["writing_style", "business_rule", "objection", "negotiation"] as const;
export type LearningCategory = (typeof CATEGORIES)[number];

const learningSchema = z.object({
  category: z.enum(CATEGORIES),
  title: z.string().min(1).max(200),
  content: z.string().max(10000).default(""),
  situation: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().min(1).max(60)).max(30).default([]),
  engine: z.string().max(60).optional().nullable(),
  original_input: z.string().max(20000).optional().nullable(),
  ai_response: z.string().max(20000).optional().nullable(),
  final_response: z.string().max(20000).optional().nullable(),
  company_id: z.string().uuid().optional().nullable(),
});

export const listLearning = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("learning_entries")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

export const getLearning = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("learning_entries")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), patch: learningSchema }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("learning_entries")
        .update(data.patch)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("learning_entries")
      .insert({ ...data.patch, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("learning_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
