import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Check,
  Clock3,
  ExternalLink,
  Headphones,
  Mail,
  MessageCircle,
  Mic2,
  Phone,
  Plus,
  Search,
  Send,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { listTeamMembers, type TeamMember } from "@/lib/leads.functions";
import { analyzeReceptionConversation } from "@/lib/reception-ai.functions";
import {
  addReceptionMessage,
  createReceptionConversation,
  getReceptionIntegrationStatus,
  listReceptionConversations,
  listReceptionMessages,
  updateReceptionConversation,
  type InquiryType,
  type ReceptionChannel,
  type ReceptionConversation,
  type ReceptionMessage,
  type ReceptionPriority,
  type ReceptionPatch,
  type ReceptionStatus,
} from "@/lib/reception.functions";

export const Route = createFileRoute("/_authenticated/app/reception")({
  head: () => ({ meta: [{ title: "Reception — Sales Insights" }] }),
  component: ReceptionPage,
});

const statusMeta: Record<ReceptionStatus, { label: string; className: string }> = {
  new: { label: "New", className: "bg-sky-50 text-sky-700 border-sky-200" },
  active: { label: "Active", className: "bg-amber-50 text-amber-700 border-amber-200" },
  qualified: { label: "Qualified", className: "bg-violet-50 text-violet-700 border-violet-200" },
  handed_off: { label: "Handed off", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const channelIcon: Record<ReceptionChannel | "internal" | "system", typeof Phone> = {
  voice: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  manual: Headphones,
  internal: Headphones,
  system: ShieldCheck,
};

const timeAgo = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

function ReceptionPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReceptionConversations);
  const messagesFn = useServerFn(listReceptionMessages);
  const createFn = useServerFn(createReceptionConversation);
  const updateFn = useServerFn(updateReceptionConversation);
  const addMessageFn = useServerFn(addReceptionMessage);
  const statusFn = useServerFn(getReceptionIntegrationStatus);
  const analyzeFn = useServerFn(analyzeReceptionConversation);
  const teamFn = useServerFn(listTeamMembers);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReceptionStatus | "all">("all");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [composer, setComposer] = useState("");
  const [composerChannel, setComposerChannel] = useState<"internal" | "email" | "whatsapp">("internal");

  const { data: conversations = [], isLoading } = useQuery<ReceptionConversation[]>({
    queryKey: ["reception-conversations"],
    queryFn: () => listFn(),
    refetchInterval: 30_000,
  });
  const { data: integrations } = useQuery({
    queryKey: ["reception-integrations"],
    queryFn: () => statusFn(),
    staleTime: 60_000,
  });
  const { data: team = [] } = useQuery<TeamMember[]>({
    queryKey: ["team-members"],
    queryFn: () => teamFn(),
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (filter !== "all" && conversation.status !== filter) return false;
      if (!needle) return true;
      return [
        conversation.contact_name,
        conversation.company_name,
        conversation.phone,
        conversation.email,
        conversation.product_interest,
        conversation.service_interest,
        conversation.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [conversations, filter, search]);

  const callMetrics = useMemo(() => {
    const calls = conversations.filter((item) => item.channel === "voice");
    return {
      recent: calls.length,
      recorded: calls.filter((item) => item.recording_url).length,
      duration: calls.reduce((total, item) => total + (item.recording_duration_seconds || 0), 0),
    };
  }, [conversations]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
    if (selectedId && !conversations.some((item) => item.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [conversations, filtered, selectedId]);

  const active = conversations.find((item) => item.id === selectedId) ?? null;
  const { data: messages = [] } = useQuery<ReceptionMessage[]>({
    queryKey: ["reception-messages", selectedId],
    queryFn: () => messagesFn({ data: { conversationId: selectedId! } }),
    enabled: Boolean(selectedId),
    refetchInterval: 20_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["reception-conversations"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["reception-messages", selectedId] });
  };

  const update = useMutation({
    mutationFn: (input: { id: string; patch: ReceptionPatch }) => updateFn({ data: input }),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });

  const addMessage = useMutation({
    mutationFn: (content: string) =>
      addMessageFn({
        data: {
          conversation_id: selectedId!,
          channel: composerChannel,
          direction: composerChannel === "internal" ? "internal" : "out",
          sender_role: "staff",
          content,
          delivery_status: composerChannel === "internal" ? "recorded" : "draft",
        },
      }),
    onSuccess: () => {
      setComposer("");
      refresh();
      toast.success(composerChannel === "internal" ? "Internal note added" : "Draft saved");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { conversationId: selectedId! } }),
    onSuccess: () => {
      refresh();
      toast.success("AI sales plan prepared");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col md:-m-6 md:h-[calc(100%+3rem)]">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <h1 className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight">
            <Headphones className="h-5 w-5 text-indigo-600" /> Reception
          </h1>
          <span className="text-xs text-muted-foreground">{conversations.length} conversations</span>
          <div className="relative ml-2 w-64 max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search caller, company, inquiry…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <Button size="sm" onClick={() => setIntakeOpen(true)} className="shrink-0">
          <Plus className="mr-1.5 h-4 w-4" /> New intake
        </Button>
      </HeaderPortal>

      <div className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2">
        {(["all", "new", "active", "qualified", "handed_off", "closed"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              filter === value ? "border-slate-900 bg-slate-900 text-white" : "bg-background hover:bg-accent",
            )}
          >
            {value === "all" ? "All" : statusMeta[value].label}
          </button>
        ))}
        <div className="ml-auto hidden items-center gap-1.5 lg:flex">
          <IntegrationPill label="ElevenLabs" ready={integrations?.elevenlabs} />
          <IntegrationPill label="Twilio Voice" ready={integrations?.twilioVoice} />
          <IntegrationPill label="WhatsApp" ready={integrations?.whatsapp} />
          <IntegrationPill label="Email" ready={integrations?.email} />
          <IntegrationPill label={integrations?.aiProvider ? `AI · ${integrations.aiProvider}` : "AI"} ready={integrations?.ai} />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 border-b bg-card">
        <Metric icon={Phone} value={String(callMetrics.recent)} label="Recent calls" tone="violet" />
        <Metric icon={Mic2} value={String(callMetrics.recorded)} label="Recorded conversations" tone="sky" />
        <Metric icon={Clock3} value={formatDuration(callMetrics.duration)} label="Recorded duration" tone="teal" />
      </div>

      <div className="flex min-h-0 flex-1 bg-background">
        <aside className="flex w-80 shrink-0 flex-col border-r bg-card">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-6 text-center text-xs text-muted-foreground">Loading reception…</p>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center">
                <Mic2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a manual intake now. Incoming calls will land here after ElevenLabs and Twilio are connected.
                </p>
              </div>
            ) : (
              filtered.map((conversation) => {
                const Icon = channelIcon[conversation.channel];
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    className={cn(
                      "flex w-full gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-accent/50",
                      selectedId === conversation.id && "bg-accent/70",
                    )}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">
                          {conversation.company_name || conversation.contact_name || conversation.follow_up_number || "Unknown caller"}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(conversation.last_message_at)}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                        {conversation.product_interest || conversation.service_interest || conversation.summary || "Inquiry captured"}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        <Badge variant="outline" className={cn("h-5 px-1.5 text-[9px]", statusMeta[conversation.status].className)}>
                          {statusMeta[conversation.status].label}
                        </Badge>
                        <span className="text-[10px] capitalize text-muted-foreground">{conversation.inquiry_type}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {!active ? (
          <section className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a conversation or create a new intake.
          </section>
        ) : (
          <>
            <section className="flex min-w-0 flex-1 flex-col bg-muted/10">
              <div className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">
                    {active.company_name || active.contact_name || "Customer inquiry"}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {active.contact_name || "Unknown contact"} · {active.follow_up_number || active.email || "Contact pending"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => analyze.mutate()}
                    disabled={!integrations?.ai || analyze.isPending || active.ai_status === "processing"}
                    title={integrations?.ai ? "Analyze the conversation and prepare next actions" : "Connect Anthropic or OpenAI to enable AI analysis"}
                  >
                    <Bot className="mr-1.5 h-3.5 w-3.5" />
                    {analyze.isPending || active.ai_status === "processing" ? "Analyzing…" : active.ai_status === "ready" ? "Refresh AI plan" : "Analyze with AI"}
                  </Button>
                  {active.lead_id && (
                    <Link
                      to="/app/leads/$id"
                      params={{ id: active.lead_id }}
                      className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      Open lead <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                  <Badge variant="outline" className={statusMeta[active.status].className}>
                    {statusMeta[active.status].label}
                  </Badge>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {active.ai_plan && <AiPlanCard plan={active.ai_plan} provider={active.ai_provider} />}
                <div className="rounded-xl border bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold"><Mic2 className="h-3.5 w-3.5 text-indigo-600" /> Call recording</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {active.recording_url
                          ? `${formatDuration(active.recording_duration_seconds)} · recorded conversation`
                          : "The ElevenLabs/Twilio recording will attach here automatically."}
                      </p>
                    </div>
                    {active.lead_id && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Lead created</Badge>}
                  </div>
                  {active.recording_url && <audio controls preload="metadata" src={active.recording_url} className="mt-3 h-9 w-full" />}
                </div>
                {messages.length === 0 ? (
                  <div className="mx-auto mt-16 max-w-sm text-center text-sm text-muted-foreground">
                    The transcript and channel history will appear here. Add an internal note or save an outbound draft below.
                  </div>
                ) : (
                  messages.map((message) => {
                    const Icon = channelIcon[message.channel];
                    const outbound = message.direction === "out";
                    const internal = message.direction === "internal";
                    return (
                      <div key={message.id} className={cn("flex", outbound && "justify-end", internal && "justify-center")}>
                        <div
                          className={cn(
                            "max-w-[78%] rounded-2xl border bg-card px-3.5 py-2.5 shadow-sm",
                            outbound && "border-indigo-600 bg-indigo-600 text-white",
                            internal && "w-full max-w-[90%] border-dashed bg-amber-50/70 text-amber-950",
                          )}
                        >
                          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium opacity-70">
                            <Icon className="h-3 w-3" />
                            <span className="capitalize">{message.channel} · {message.sender_role}</span>
                            {message.delivery_status === "draft" && <span>· Draft</span>}
                          </div>
                          {message.subject && <p className="mb-1 text-xs font-semibold">{message.subject}</p>}
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                          <p className="mt-1 text-right text-[9px] opacity-60">{timeAgo(message.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (composer.trim()) addMessage.mutate(composer.trim());
                }}
                className="shrink-0 border-t bg-card p-3"
              >
                <div className="mb-2 flex items-center gap-1.5">
                  {(["internal", "email", "whatsapp"] as const).map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => setComposerChannel(channel)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[10px] font-medium capitalize",
                        composerChannel === channel ? "border-slate-900 bg-slate-900 text-white" : "hover:bg-accent",
                      )}
                    >
                      {channel === "internal" ? "Internal note" : `${channel} draft`}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <Textarea
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    placeholder={composerChannel === "internal" ? "Add context for the sales team…" : `Draft a ${composerChannel} follow-up…`}
                    rows={2}
                    className="min-h-16 resize-none"
                  />
                  <Button type="submit" size="icon" disabled={!composer.trim() || addMessage.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </section>

            <ReceptionDetails conversation={active} team={team} onUpdate={(patch) => update.mutate({ id: active.id, patch })} />
          </>
        )}
      </div>

      <NewIntakeDialog
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        onCreate={async (payload) => {
          const result = await createFn({ data: payload });
          setSelectedId(result.id);
          setIntakeOpen(false);
          refresh();
          toast.success("Reception intake created");
        }}
      />
    </div>
  );
}

function AiPlanCard({ plan, provider }: { plan: NonNullable<ReceptionConversation["ai_plan"]>; provider: ReceptionConversation["ai_provider"] }) {
  const providerPlan = plan as typeof plan & { transcript_summary?: string };
  const summary = providerPlan.summary || providerPlan.transcript_summary || "Conversation captured by Reception.";
  const suggestedResponse = providerPlan.suggested_response || "Review the call and contact the customer using the captured follow-up details.";
  const actions = Array.isArray(providerPlan.actions) ? providerPlan.actions.filter((action) => typeof action === "string") : [];
  const productMatches = Array.isArray(providerPlan.product_matches) ? providerPlan.product_matches.filter((lookup) => lookup && typeof lookup.query === "string" && Array.isArray(lookup.matches)) : [];
  const actionLabels: Record<string, string> = {
    upsert_lead: "Update lead",
    lookup_product: "Check products",
    prepare_quotation: "Prepare quotation",
    prepare_whatsapp: "Draft WhatsApp",
    prepare_email: "Draft email",
    assign_sales: "Assign sales owner",
  };
  return (
    <div className="overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/60 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-indigo-100 px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-indigo-950"><Bot className="h-4 w-4 text-indigo-600" /> AI sales plan</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{summary}</p>
        </div>
        <Badge variant="outline" className="shrink-0 border-indigo-200 bg-white/70 text-[9px] capitalize text-indigo-700">{provider}</Badge>
      </div>
      <div className="grid gap-4 px-4 py-3 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recommended response</p>
          <p className="mt-1 text-sm leading-relaxed">{suggestedResponse}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {actions.map((action) => <span key={action} className="rounded-full border border-indigo-100 bg-white px-2 py-1 text-[10px] font-medium text-indigo-700">{actionLabels[action] || action}</span>)}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Verified CRM matches</p>
          {productMatches.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No product was clear enough to check yet.</p>
          ) : productMatches.map((lookup) => (
            <div key={lookup.query} className="mt-1.5 rounded-lg border bg-white/80 p-2">
              <p className="text-xs font-medium">{lookup.quantity ? `${lookup.quantity} × ` : ""}{lookup.query}</p>
              {lookup.matches.length === 0 ? <p className="mt-1 text-[10px] text-amber-700">No exact pricebook match — review required.</p> : lookup.matches.slice(0, 2).map((match) => (
                <p key={match.id} className="mt-1 flex justify-between gap-3 text-[10px] text-muted-foreground">
                  <span className="truncate">{match.name}{match.part_number ? ` · ${match.part_number}` : ""}</span>
                  <span className="shrink-0 font-medium text-foreground">{match.selling_price_cents == null ? "Price pending" : `${match.currency} ${(match.selling_price_cents / 100).toLocaleString()}`}</span>
                </p>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="border-t border-indigo-100 px-4 py-2 text-[10px] text-muted-foreground">AI recommends the next steps. Product prices come only from the CRM pricebook; quotations and outbound messages remain drafts for review.</p>
    </div>
  );
}

function IntegrationPill({ label, ready }: { label: string; ready?: boolean }) {
  return (
    <span className={cn("flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-medium", ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-muted/50 text-muted-foreground")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-emerald-500" : "bg-slate-300")} />
      {label}
    </span>
  );
}

function formatDuration(totalSeconds: number) {
  if (!totalSeconds) return "0m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null, `${seconds}s`].filter(Boolean).join(" ");
}

function Metric({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Phone;
  value: string;
  label: string;
  tone: "violet" | "sky" | "teal";
}) {
  const tones = {
    violet: "bg-violet-50 text-violet-700",
    sky: "bg-sky-50 text-sky-700",
    teal: "bg-teal-50 text-teal-700",
  };
  return (
    <div className="flex items-center gap-3 border-r px-4 py-3 last:border-r-0">
      <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tones[tone])}><Icon className="h-4 w-4" /></span>
      <span><strong className="block text-lg leading-none">{value}</strong><span className="mt-1 block text-[10px] text-muted-foreground">{label}</span></span>
    </div>
  );
}

function ReceptionDetails({
  conversation,
  team,
  onUpdate,
}: {
  conversation: ReceptionConversation;
  team: TeamMember[];
  onUpdate: (patch: ReceptionPatch) => void;
}) {
  return (
    <aside className="hidden w-80 shrink-0 overflow-y-auto border-l bg-card p-4 xl:block">
      <div className="flex items-center gap-2">
        <UserRoundCheck className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold">Reception brief</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Everything a salesperson needs before taking over.</p>

      <div className="mt-5 space-y-4">
        <Detail label="Contact" value={conversation.contact_name} />
        <Detail label="Company" value={conversation.company_name} />
        <Detail label="Location" value={conversation.location} />
        <Detail label="Phone" value={conversation.phone} />
        <Detail label="WhatsApp" value={conversation.whatsapp} />
        <Detail label="Email" value={conversation.email} />
        <Detail label="Product inquiry" value={conversation.product_interest} />
        <Detail label="Service inquiry" value={conversation.service_interest} />
      </div>

      <div className="mt-5 rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Follow-up number</span>
          {conversation.follow_up_number_confirmed && <Check className="h-3.5 w-3.5 text-emerald-600" />}
        </div>
        <p className="mt-1 text-sm font-medium">{conversation.follow_up_number || "Not captured"}</p>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={conversation.follow_up_number_confirmed}
            onCheckedChange={(checked) => onUpdate({ follow_up_number_confirmed: checked === true })}
          />
          Customer confirmed this number
        </label>
      </div>

      <div className="mt-5 space-y-3 border-t pt-4">
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
          <Select
            value={conversation.status}
            onValueChange={(value) => onUpdate({ status: value as ReceptionStatus })}
          >
            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(statusMeta).map(([value, meta]) => <SelectItem key={value} value={value}>{meta.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Assign sales owner</Label>
          <Select
            value={conversation.assigned_to ?? "unassigned"}
            onValueChange={(value) => onUpdate({ assigned_to: value === "unassigned" ? null : value, status: value === "unassigned" ? conversation.status : "handed_off", lead_id: conversation.lead_id })}
          >
            <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {team.map((member) => <SelectItem key={member.id} value={member.id}>{member.full_name || member.email || "Team member"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </aside>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm">{value || "—"}</p>
    </div>
  );
}

type IntakePayload = {
  channel: ReceptionChannel;
  direction: "inbound" | "outbound";
  priority: ReceptionPriority;
  inquiry_type: InquiryType;
  contact_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  follow_up_number?: string | null;
  follow_up_number_confirmed: boolean;
  product_interest?: string | null;
  service_interest?: string | null;
  summary?: string | null;
  location?: string | null;
  initial_message?: string | null;
};

function NewIntakeDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: IntakePayload) => Promise<void>;
}) {
  const [channel, setChannel] = useState<ReceptionChannel>("voice");
  const [inquiryType, setInquiryType] = useState<InquiryType>("product");
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [followUpNumber, setFollowUpNumber] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [interest, setInterest] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onCreate({
        channel,
        direction: "inbound",
        priority: "normal",
        inquiry_type: inquiryType,
        contact_name: contactName || null,
        company_name: companyName || null,
        phone: phone || null,
        whatsapp: followUpNumber || phone || null,
        email: email || null,
        location: location || null,
        follow_up_number: followUpNumber || phone || null,
        follow_up_number_confirmed: confirmed,
        product_interest: inquiryType === "product" ? interest || null : null,
        service_interest: inquiryType === "service" ? interest || null : null,
        summary: summary || null,
        initial_message: summary || null,
      });
      setContactName("");
      setCompanyName("");
      setPhone("");
      setEmail("");
      setLocation("");
      setFollowUpNumber("");
      setConfirmed(false);
      setInterest("");
      setSummary("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Headphones className="h-5 w-5 text-indigo-600" /> New reception intake</DialogTitle>
          <p className="text-sm text-muted-foreground">Use this now for manual calls. The voice agent will populate the same fields automatically later.</p>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div><Label>Channel</Label><Select value={channel} onValueChange={(value) => setChannel(value as ReceptionChannel)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="voice">Voice call</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent></Select></div>
          <div><Label>Inquiry type</Label><Select value={inquiryType} onValueChange={(value) => setInquiryType(value as InquiryType)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="product">Product inquiry</SelectItem><SelectItem value="service">Service inquiry</SelectItem><SelectItem value="general">General inquiry</SelectItem></SelectContent></Select></div>
          <div><Label>Contact name</Label><Input className="mt-1" value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Customer name" /></div>
          <div><Label>Company</Label><Input className="mt-1" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Company or organization" /></div>
          <div><Label>Calling number</Label><Input className="mt-1" value={phone} onChange={(event) => { setPhone(event.target.value); if (!followUpNumber) setFollowUpNumber(event.target.value); }} placeholder="+971…" /></div>
          <div><Label>Email</Label><Input className="mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></div>
          <div><Label>Location</Label><Input className="mt-1" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Dubai, UAE" /></div>
          <div className="sm:col-span-2"><Label>{inquiryType === "service" ? "Service required" : inquiryType === "product" ? "Product required" : "What do they need?"}</Label><Input className="mt-1" value={interest} onChange={(event) => setInterest(event.target.value)} placeholder="e.g. 20 biometric readers for three branches" /></div>
          <div className="sm:col-span-2 rounded-xl border bg-muted/20 p-3">
            <Label>WhatsApp follow-up number</Label>
            <Input className="mt-1" value={followUpNumber} onChange={(event) => setFollowUpNumber(event.target.value)} placeholder="Ask: Is this the best number for WhatsApp follow-up?" />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /> Customer confirmed this number</label>
          </div>
          <div className="sm:col-span-2"><Label>Call summary / customer message</Label><Textarea className="mt-1" rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Capture the requirement, quantity, timing, location and promised next step…" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || (!contactName.trim() && !companyName.trim() && !phone.trim())}>{saving ? "Saving…" : "Create intake"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
