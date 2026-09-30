import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Send, ExternalLink, FileText, Settings2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  listWhatsappConversations,
  listWhatsappThread,
  sendWhatsappMessage,
  sendWhatsappGeneralUpdate,
  type WaConversation,
  type WaMessage,
} from "@/lib/whatsapp.functions";
import { getWhatsAppAgentSettings, saveWhatsAppAgentSettings, type WhatsAppAgentSettings } from "@/lib/whatsapp-agent-settings.functions";

export const Route = createFileRoute("/_authenticated/app/whatsapp/")({
  head: () => ({ meta: [{ title: "WhatsApp — Sales Insights" }] }),
  component: WhatsAppModule,
});

const timeAgo = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

function WhatsAppModule() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWhatsappConversations);
  const threadFn = useServerFn(listWhatsappThread);
  const sendFn = useServerFn(sendWhatsappMessage);
  const templateFn = useServerFn(sendWhatsappGeneralUpdate);
  const getAgentSettings = useServerFn(getWhatsAppAgentSettings);
  const saveAgentSettings = useServerFn(saveWhatsAppAgentSettings);

  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [agentSettings, setAgentSettings] = useState<WhatsAppAgentSettings | null>(null);

  const settingsQuery = useQuery({ queryKey: ["whatsapp-agent-settings"], queryFn: () => getAgentSettings(), enabled: settingsOpen });
  useEffect(() => { if (settingsQuery.data) setAgentSettings(settingsQuery.data); }, [settingsQuery.data]);
  const saveSettings = useMutation({
    mutationFn: (value: WhatsAppAgentSettings) => saveAgentSettings({ data: value }),
    onSuccess: (value) => { setAgentSettings(value); setSettingsOpen(false); toast.success("WhatsApp agent settings saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: convos = [] } = useQuery<WaConversation[]>({
    queryKey: ["wa-conversations"],
    queryFn: () => listFn(),
    refetchInterval: 20_000,
  });
  const active = useMemo(() => convos.find((c) => c.lead_id === selected) ?? null, [convos, selected]);

  const { data: thread = [] } = useQuery<WaMessage[]>({
    queryKey: ["wa-thread", selected],
    queryFn: () => threadFn({ data: { leadId: selected! } }),
    enabled: !!selected,
    refetchInterval: 15_000,
  });

  const send = useMutation({
    mutationFn: (body: string) => sendFn({ data: { leadId: selected!, body } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["wa-thread", selected] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendTemplate = useMutation({
    mutationFn: () => templateFn({ data: { leadId: selected!, customerName: templateName.trim() } }),
    onSuccess: () => {
      setTemplateOpen(false);
      qc.invalidateQueries({ queryKey: ["wa-thread", selected] });
      qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      toast.success("Approved WhatsApp template sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col md:-m-6 md:h-[calc(100%+3rem)]">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
            <MessageCircle className="h-5 w-5 text-[#25D366]" /> WhatsApp
          </h1>
          <span className="text-xs text-muted-foreground">{convos.length} conversations</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setSettingsOpen(true)}><Settings2 className="mr-1.5 h-4 w-4" /> Agent settings</Button>
        </div>
      </HeaderPortal>

      <div className="flex min-h-0 flex-1">
        {/* Conversation list */}
        <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
          <div className="min-h-0 flex-1 overflow-auto">
            {convos.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">
                No WhatsApp conversations yet. They appear here once Twilio is connected and a message arrives.
              </p>
            ) : (
              convos.map((c) => (
                <button
                  key={c.lead_id}
                  type="button"
                  onClick={() => setSelected(c.lead_id)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-accent/40 ${
                    selected === c.lead_id ? "bg-accent/60" : ""
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.company_name || c.contact_person || c.whatsapp || "Unknown"}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(c.last_at)}</span>
                  </div>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {c.last_direction === "out" ? "You: " : ""}
                    {c.last_body || "—"}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Thread */}
        <section className="flex min-w-0 flex-1 flex-col bg-muted/20">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a conversation.
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{active.company_name || active.contact_person || "Lead"}</div>
                  <div className="text-[11px] text-muted-foreground">{active.whatsapp}</div>
                </div>
                <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => { setTemplateName(active.contact_person || active.company_name || "there"); setTemplateOpen(true); }}><FileText className="mr-1 h-3.5 w-3.5" /> Send template</Button><Link
                  to="/app/leads/$id"
                  params={{ id: active.lead_id }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Open lead <ExternalLink className="h-3 w-3" />
                </Link></div>
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-auto p-4">
                {thread.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        m.direction === "out"
                          ? "rounded-br-sm bg-[#25D366] text-white"
                          : "rounded-bl-sm border bg-card"
                      }`}
                    >
                      {m.media_url && (
                        <a href={m.media_url} target="_blank" rel="noreferrer" className="mb-1 block text-xs underline">
                          Attachment
                        </a>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className={`mt-0.5 text-right text-[10px] ${m.direction === "out" ? "text-white/70" : "text-muted-foreground"}`}>
                        {timeAgo(m.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
                {thread.length === 0 && <p className="text-center text-xs text-muted-foreground">No messages yet.</p>}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim()) send.mutate(draft.trim());
                }}
                className="flex shrink-0 items-center gap-2 border-t bg-card p-3"
              >
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={!draft.trim() || send.isPending} className="bg-[#25D366] hover:bg-[#1ebe5b]">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Send approved WhatsApp template</DialogTitle></DialogHeader>
          <div className="space-y-3"><div><label className="mb-1 block text-xs font-medium">Customer name</label><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} /></div><div className="rounded-lg border bg-muted/30 p-3 text-sm"><p>Hello {templateName || "customer"}, this is eTOP Trading.</p><p className="mt-3">We have an update for you. Please reply to this message or tap <b>View update</b>, and our team will assist you here on WhatsApp.</p><p className="mt-3">Thank you.</p></div><p className="text-xs text-muted-foreground">This uses the approved <b>etop_general_update</b> template and opens the customer’s 24-hour reply window after they respond.</p></div>
          <DialogFooter><Button variant="outline" onClick={() => setTemplateOpen(false)}>Cancel</Button><Button onClick={() => sendTemplate.mutate()} disabled={!templateName.trim() || sendTemplate.isPending}>{sendTemplate.isPending ? "Sending…" : "Send template"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>WhatsApp agent configuration</DialogTitle></DialogHeader>
          {!agentSettings ? <p className="py-10 text-center text-sm text-muted-foreground">Loading agent settings…</p> : <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-medium">CRM manager assistant</p><p className="text-xs text-muted-foreground">Respond to approved internal numbers using live CRM information.</p></div><Switch checked={agentSettings.enabled} onCheckedChange={(enabled) => setAgentSettings({ ...agentSettings, enabled })} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Approved manager numbers</label><p className="text-xs text-muted-foreground">Only these WhatsApp senders can ask confidential CRM questions.</p>
              <div className="flex gap-2"><Input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="+971501234567" /><Button type="button" variant="outline" onClick={() => { const number = newNumber.trim(); if (number && !agentSettings.approvedNumbers.includes(number)) setAgentSettings({ ...agentSettings, approvedNumbers: [...agentSettings.approvedNumbers, number] }); setNewNumber(""); }}><Plus className="mr-1 h-4 w-4" /> Add</Button></div>
              <div className="flex flex-wrap gap-2">{agentSettings.approvedNumbers.map((number) => <span key={number} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium">{number}<button type="button" aria-label={`Remove ${number}`} onClick={() => setAgentSettings({ ...agentSettings, approvedNumbers: agentSettings.approvedNumbers.filter((n) => n !== number) })}><X className="h-3.5 w-3.5" /></button></span>)}</div>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Agent name and identity</label><Input value={agentSettings.agentName} onChange={(e) => setAgentSettings({ ...agentSettings, agentName: e.target.value })} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Personality and tone</label><Textarea rows={3} value={agentSettings.personality} onChange={(e) => setAgentSettings({ ...agentSettings, personality: e.target.value })} placeholder="Professional, concise, friendly…" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">What the agent should know</label><Textarea rows={5} value={agentSettings.knowledge} onChange={(e) => setAgentSettings({ ...agentSettings, knowledge: e.target.value })} placeholder="Describe your company, products, terminology and management priorities…" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Response instructions</label><Textarea rows={5} value={agentSettings.responseRules} onChange={(e) => setAgentSettings({ ...agentSettings, responseRules: e.target.value })} placeholder="Explain how answers should be formatted and what the agent must avoid…" /></div>
            <div className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">The assistant is currently read-only. It can explain CRM records but cannot modify data, assign staff, approve quotations or contact customers.</div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button><Button onClick={() => agentSettings && saveSettings.mutate(agentSettings)} disabled={!agentSettings || saveSettings.isPending}>{saveSettings.isPending ? "Saving…" : "Save configuration"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
