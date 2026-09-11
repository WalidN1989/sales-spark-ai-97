import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Persona = { title: string; description?: string | null };
export type UseCase = { title: string; description?: string | null };
export type IcpCustomer = { name: string; segment?: string | null };
export type IcpCompetitor = { name: string; url?: string | null };

export type IcpProfile = {
  id: string;
  name: string;
  category: string | null;
  summary: string | null;
  industries: string[];
  headcount: string | null;
  personas: Persona[];
  use_cases: UseCase[];
  customers: IcpCustomer[];
  competitors: IcpCompetitor[];
  notes: string | null;
  updated_at: string;
};

const SELECT =
  "id, name, category, summary, industries, headcount, personas, use_cases, customers, competitors, notes, updated_at";

// icp_profiles isn't in the generated types until Lovable regenerates them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = (ctx: { supabase: unknown }) => ctx.supabase as any;

export const listIcpProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IcpProfile[]> => {
    const { data, error } = await sb(context)
      .from("icp_profiles")
      .select(SELECT)
      .order("name", { ascending: true });
    if (error) {
      if (/icp_profiles|does not exist|relation/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as IcpProfile[];
  });

export const getIcpProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<IcpProfile | null> => {
    const { data: row, error } = await sb(context)
      .from("icp_profiles")
      .select(SELECT)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as IcpProfile | null;
  });

const personaArr = z.array(z.object({ title: z.string().max(200), description: z.string().max(2000).nullable().optional() }));
const custArr = z.array(z.object({ name: z.string().max(300), segment: z.string().max(120).nullable().optional() }));
const compArr = z.array(z.object({ name: z.string().max(300), url: z.string().max(500).nullable().optional() }));

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(300),
  category: z.string().trim().max(120).nullable().optional(),
  summary: z.string().trim().max(4000).nullable().optional(),
  industries: z.array(z.string().max(120)).max(60).default([]),
  headcount: z.string().trim().max(500).nullable().optional(),
  personas: personaArr.max(40).default([]),
  use_cases: personaArr.max(40).default([]),
  customers: custArr.max(300).default([]),
  competitors: compArr.max(100).default([]),
  notes: z.string().trim().max(8000).nullable().optional(),
});

export const upsertIcpProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { id, ...fields } = data;
    const row = {
      ...fields,
      category: fields.category ?? null,
      summary: fields.summary ?? null,
      headcount: fields.headcount ?? null,
      notes: fields.notes ?? null,
    };
    if (id) {
      const { error } = await sb(context).from("icp_profiles").update(row).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    // user_id here is only a placeholder that satisfies NOT NULL. The
    // icp_profiles_set_owner trigger (20260911100000_icp_owner.sql) replaces it
    // with the single ICP owner, the account list-icp-profiles filters on, so a
    // card created by any manager is visible to the research agent at once.
    const { data: created, error } = await sb(context)
      .from("icp_profiles")
      .insert({ ...row, user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id as string };
  });

export const deleteIcpProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await sb(context).from("icp_profiles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
