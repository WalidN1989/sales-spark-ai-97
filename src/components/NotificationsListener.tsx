import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  lead_id: string | null;
};

// Subscribes to the current user's notifications over Realtime and flashes a
// toast when one arrives (e.g. a lead assigned to them). Mounted once inside
// the authenticated layout, so it lives for the whole app session. Fires only
// while the app is open — closed-app push would need a service worker (later).
export function NotificationsListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as NotificationRow;
          // Refresh the bell badge/list immediately.
          qc.invalidateQueries({ queryKey: ["notifications"] });
          toast.success(n.title, {
            description: n.body ?? undefined,
            action: n.lead_id
              ? { label: "Open", onClick: () => navigate({ to: "/app/leads/$id", params: { id: n.lead_id! } }) }
              : undefined,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, navigate, qc]);

  return null;
}
