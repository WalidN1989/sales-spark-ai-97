import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Mail, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  addReceptionMessage,
  getReceptionIntegrationStatus,
  listReceptionConversations,
  listReceptionMessages,
  type ReceptionConversation,
  type ReceptionMessage,
} from "@/lib/reception.functions";

export const Route = createFileRoute("/_authenticated/app/email")({
  head: () => ({ meta: [{ title: "Email — Sales Insights" }] }),
  component: EmailModule,
});

function EmailModule() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReceptionConversations);
  const messagesFn = useServerFn(listReceptionMessages);
  const addMessageFn = useServerFn(addReceptionMessage);
  const integrationFn = useServerFn(getReceptionIntegrationStatus);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data: all = [] } = useQuery<ReceptionConversation[]>({
    queryKey: ["reception-conversations"],
    queryFn: () => listFn(),
  });
  const { data: integration } = useQuery({
    queryKey: ["reception-integrations"],
    queryFn: () => integrationFn(),
  });
  const conversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((item) => item.email && (!needle || [item.company_name, item.contact_name, item.email, item.summary].filter(Boolean).join(" ").toLowerCase().includes(needle)));
  }, [all, search]);

  useEffect(() => {
    if (!selected && conversations[0]) setSelected(conversations[0].id);
  }, [conversations, selected]);

  const active = conversations.find((item) => item.id === selected) ?? null;
  const { data: messages = [] } = useQuery<ReceptionMessage[]>({
    queryKey: ["reception-messages", selected],
    queryFn: () => messagesFn({ data: { conversationId: selected! } }),
    enabled: Boolean(selected),
  });
  const emails = messages.filter((message) => message.channel === "email");

  const saveDraft = useMutation({
    mutationFn: () =>
      addMessageFn({
        data: {
          conversation_id: selected!,
          channel: "email",
          direction: "out",
          sender_role: "staff",
          subject: subject.trim() || null,
          content: body.trim(),
          delivery_status: "draft",
        },
      }),
    onSuccess: () => {
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["reception-messages", selected] });
      toast.success("Email draft saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col md:-m-6 md:h-[calc(100%+3rem)]">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="flex shrink-0 items-center gap-2 text-lg font-bold"><Mail className="h-5 w-5 text-blue-600" /> Email</h1>
          <Badge variant="outline" className={integration?.email ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-muted-foreground"}>
            {integration?.email ? "Connected" : "Provider pending"}
          </Badge>
          <div className="relative ml-2 w-64 max-w-full"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search recipient or company…" className="h-8 pl-8 text-xs" /></div>
        </div>
      </HeaderPortal>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r bg-card">
          {conversations.length === 0 ? (
            <div className="p-8 text-center"><Mail className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" /><p className="text-sm font-medium">No email contacts yet</p><p className="mt-1 text-xs text-muted-foreground">Reception inquiries with a captured email address will appear here.</p></div>
          ) : conversations.map((conversation) => (
            <button key={conversation.id} type="button" onClick={() => setSelected(conversation.id)} className={`w-full border-b px-3 py-3 text-left hover:bg-accent/50 ${selected === conversation.id ? "bg-accent/70" : ""}`}>
              <p className="truncate text-sm font-semibold">{conversation.company_name || conversation.contact_name || conversation.email}</p>
              <p className="truncate text-xs text-muted-foreground">{conversation.email}</p>
              <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{conversation.summary || conversation.product_interest || conversation.service_interest || "Customer inquiry"}</p>
            </button>
          ))}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-muted/10">
          {!active ? <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a reception contact.</div> : <>
            <div className="flex items-center justify-between border-b bg-card px-4 py-3"><div><p className="text-sm font-semibold">{active.company_name || active.contact_name}</p><p className="text-xs text-muted-foreground">{active.email}</p></div><Link to="/app/reception" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open reception <ExternalLink className="h-3 w-3" /></Link></div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
              {emails.length === 0 ? <p className="mt-16 text-center text-sm text-muted-foreground">No email history yet. Prepare the first follow-up below.</p> : emails.map((message) => <div key={message.id} className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{message.subject || "No subject"}</p><Badge variant="outline" className="text-[9px] capitalize">{message.delivery_status}</Badge></div><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{message.content}</p></div>)}
            </div>
            <div className="shrink-0 space-y-2 border-t bg-card p-4">
              <div className="flex items-center gap-2"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" /><span className="shrink-0 text-xs text-muted-foreground">To: {active.email}</span></div>
              <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={4} placeholder="Write the immediate email response…" />
              <div className="flex items-center justify-between"><p className="text-[11px] text-muted-foreground">Sending will unlock when the email provider is connected. Drafts are safe to prepare now.</p><Button onClick={() => saveDraft.mutate()} disabled={!body.trim() || saveDraft.isPending}><Plus className="mr-1.5 h-4 w-4" /> Save draft</Button></div>
            </div>
          </>}
        </section>
      </div>
    </div>
  );
}
