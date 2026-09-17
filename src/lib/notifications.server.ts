import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NotifyRow = {
  user_id: string; // recipient
  actor_id: string; // who caused it
  type: string; // 'lead_assigned' | 'reminder' | 'meeting' | 'chat' | …
  title: string;
  body?: string | null;
  lead_id?: string | null;
};

// Write in-app notifications with the service role, so an actor can address a
// DIFFERENT user (assignment, a shared reminder, a chat message). The
// recipient's browser receives the INSERT over Realtime and flashes a toast.
// Never notifies the actor about their own action. Best-effort: failures are
// logged, never thrown — a notification must not break the action itself.
export async function notify(rows: NotifyRow[]) {
  const clean = rows.filter((r) => r.user_id && r.user_id !== r.actor_id);
  if (!clean.length) return;
  try {
    // notifications isn't in the generated types yet — cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("notifications").insert(clean);
  } catch (e) {
    console.error("notify failed", e);
  }
}
