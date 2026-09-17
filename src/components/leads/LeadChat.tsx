import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { listLeadMessages, sendLeadMessage, type LeadMessage } from "@/lib/lead-chat.functions";

// Team chat for a single lead — talk to whoever else works it (assignee /
// owner / managers). Messages stream live over Realtime; the other person also
// gets a toast via the notifications system.
export function LeadChat({ leadId }: { leadId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadMessages);
  const sendFn = useServerFn(sendLeadMessage);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery<LeadMessage[]>({
    queryKey: ["lead-messages", leadId],
    queryFn: () => listFn({ data: { leadId } }),
  });

  // Live updates: any insert on this lead's thread refetches (keeps sender
  // names + ordering correct without reconstructing them on the client).
  useEffect(() => {
    const channel = supabase
      .channel(`lead_messages:${leadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lead_messages", filter: `lead_id=eq.${leadId}` },
        () => qc.invalidateQueries({ queryKey: ["lead-messages", leadId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, qc]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (body: string) => sendFn({ data: { leadId, body } }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["lead-messages", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const body = text.trim();
    if (body) send.mutate(body);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-2">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No messages yet. Ask a teammate what&apos;s happening on this lead.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-1.5 text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-card border",
                  )}
                >
                  {!mine && <div className="mb-0.5 text-[10px] font-semibold opacity-70">{m.sender_name}</div>}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                </div>
                <span className="mt-0.5 text-[10px] text-muted-foreground">
                  {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Message the team on this lead… (Enter to send)"
          className="min-h-[42px] resize-none"
        />
        <Button size="icon" onClick={submit} disabled={!text.trim() || send.isPending} title="Send">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
