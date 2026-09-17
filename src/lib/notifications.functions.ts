import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppNotification = {
  id: string;
  type: string; // 'lead_assigned' | 'reminder' | 'chat' | …
  title: string;
  body: string | null;
  lead_id: string | null;
  read_at: string | null;
  created_at: string;
};

// The signed-in user's recent notifications (RLS scopes to their own rows).
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppNotification[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any)
      .from("notifications")
      .select("id, type, title, body, lead_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      // Before the notifications migration runs, degrade to empty.
      if (/notifications|does not exist|relation/i.test(error.message)) return [];
      throw new Error(error.message);
    }
    return (data ?? []) as AppNotification[];
  });

// Mark notifications read. With ids → those; without → all unread.
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (context.supabase as any)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
