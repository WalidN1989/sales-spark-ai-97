import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APP_MODULES } from "@/lib/permissions";

const moduleKeys = APP_MODULES.filter((module) => module.key !== "settings").map(
  (module) => module.key,
);
const moduleKeySchema = z.string().refine((value) => moduleKeys.includes(value), "Unknown module");

// Supabase types regenerate after Lovable applies the migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (context: { supabase: unknown }) => context.supabase as any;

async function requireAdmin(context: { supabase: unknown; userId: string }) {
  const { data, error } = await db(context)
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only an administrator can change module visibility.");
}

async function currentOrganizationId(context: { supabase: unknown; userId: string }) {
  const { data, error } = await db(context)
    .from("org_members")
    .select("org_id")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .limit(1)
    .single();
  if (error) throw new Error(error.message);
  return data.org_id as string;
}

export const getHiddenModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const orgId = await currentOrganizationId(context);
    const { data, error } = await db(context)
      .from("organizations")
      .select("hidden_modules")
      .eq("id", orgId)
      .single();
    if (error) {
      if (/hidden_modules/i.test(error.message)) {
        throw new Error("Apply the hidden-modules database migration before using this setting.");
      }
      throw new Error(error.message);
    }
    return { hiddenModules: (data.hidden_modules ?? []) as string[] };
  });

export const setModuleHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) =>
    z.object({ module: moduleKeySchema, hidden: z.boolean() }).parse(value),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context);
    const orgId = await currentOrganizationId(context);
    const { data: organization, error: readError } = await db(context)
      .from("organizations")
      .select("hidden_modules")
      .eq("id", orgId)
      .single();
    if (readError) {
      if (/hidden_modules/i.test(readError.message)) {
        throw new Error("Apply the hidden-modules database migration before using this setting.");
      }
      throw new Error(readError.message);
    }
    const current = new Set<string>((organization.hidden_modules ?? []) as string[]);
    if (data.hidden) current.add(data.module);
    else current.delete(data.module);
    const hiddenModules = [...current].filter((key) => moduleKeys.includes(key));
    const { error } = await db(context)
      .from("organizations")
      .update({ hidden_modules: hiddenModules })
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { hiddenModules };
  });
