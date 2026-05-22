import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  company_name: z.string().max(200).optional().nullable(),
  industry: z.string().max(200).optional().nullable(),
  products_services: z.string().max(2000).optional().nullable(),
  strengths: z.string().max(2000).optional().nullable(),
  target_niche: z.string().max(2000).optional().nullable(),
});

export const getMyCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("my_company")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data;
  });

export const upsertMyCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("my_company")
      .upsert({ ...data, user_id: context.userId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
