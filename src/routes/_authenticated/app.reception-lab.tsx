import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CheckCircle2,
  CircleStop,
  Clock3,
  Headphones,
  Languages,
  Mic,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { HeaderPortal } from "@/components/layout/HeaderPortal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  beginSinhalaLabTest,
  loadLatestSinhalaLabTest,
  replyInSinhala,
  saveSinhalaLabScores,
  type SinhalaLabReply,
  type SinhalaLabScores,
} from "@/lib/sinhala-lab.functions";
import {
  getSinhalaSpeechStatus,
  synthesizeSinhalaSpeech,
  type SinhalaSpeechProvider,
} from "@/lib/sinhala-speech";

export const Route = createFileRoute("/_authenticated/app/reception-lab")({
  head: () => ({ meta: [{ title: "Sinhala Voice Lab — Sales Insights" }] }),
  component: SinhalaVoiceLab,
});

type Turn = {
  role: "caller" | "receptionist";
  text: string;
  english?: string;
  latency?: number;
  intent?: string;
};
type SpeechRecognitionEventLike = Event & {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};
type SpeechRecognitionErrorLike = Event & { error?: string };
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const greeting = "eTOP වෙත ඇමතීම ගැන ස්තූතියි. මම මායා. ඔබට උදව් කරන්නේ කොහොමද?";

function SinhalaVoiceLab() {
  const replyFn = useServerFn(replyInSinhala);
  const beginFn = useServerFn(beginSinhalaLabTest);
  const loadFn = useServerFn(loadLatestSinhalaLabTest);
  const saveScoresFn = useServerFn(saveSinhalaLabScores);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [turns, setTurns] = useState<Turn[]>([
    {
      role: "receptionist",
      text: greeting,
      english: "Thank you for calling eTOP. Maya with you. How can I help?",
    },
  ]);
  const [reply, setReply] = useState<SinhalaLabReply | null>(null);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [speechProvider, setSpeechProvider] = useState<SinhalaSpeechProvider | null>(null);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const [sinhalaVoices, setSinhalaVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [scores, setScores] = useState({
    recognition: 0,
    understanding: 0,
    pronunciation: 0,
    naturalness: 0,
  });

  useEffect(() => {
    const loadVoices = () =>
      setSinhalaVoices(
        window.speechSynthesis
          ?.getVoices()
          .filter((voice) => voice.lang.toLowerCase().startsWith("si")) ?? [],
      );
    setRecognitionSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    loadVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
    let cancelled = false;
    Promise.all([loadFn(), getSinhalaSpeechStatus()])
      .then(([saved, speech]) => {
        if (cancelled) return;
        setSpeechProvider(speech.provider);
        if (saved) {
          setSessionId(saved.id);
          setTurns(saved.turns.length ? saved.turns : turns);
          setScores(saved.scores);
          const lastReply = [...saved.turns]
            .reverse()
            .find((turn) => turn.role === "receptionist" && turn.intent);
          if (lastReply?.intent) {
            setReply({
              sinhala: lastReply.text,
              english: lastReply.english || "",
              intent: lastReply.intent,
            });
          }
        }
      })
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : "Saved Sinhala test could not be restored.",
        ),
      )
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
      recognitionRef.current?.abort?.();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.removeEventListener("voiceschanged", loadVoices);
    };
    // The server function handles are stable for the lifetime of this route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const average = useMemo(() => {
    const values = Object.values(scores).filter(Boolean);
    return values.length ? values.reduce((sum, score) => sum + score, 0) / values.length : 0;
  }, [scores]);

  const speak = async (text: string) => {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    setSpeaking(true);
    try {
      if (sinhalaVoices[0]) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "si-LK";
        utterance.voice = sinhalaVoices[0];
        utterance.rate = 0.92;
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => {
          setSpeaking(false);
          toast.error("The installed Sinhala voice could not play this response.");
        };
        window.speechSynthesis.speak(utterance);
        return;
      }
      const audio = await synthesizeSinhalaSpeech(text);
      const audioUrl = URL.createObjectURL(audio);
      const player = new Audio(audioUrl);
      audioRef.current = player;
      player.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setSpeaking(false);
      };
      player.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setSpeaking(false);
        toast.error("The generated Sinhala audio could not be played.");
      };
      await player.play();
    } catch (error) {
      setSpeaking(false);
      toast.error(
        error instanceof Error ? error.message : "Sinhala speech could not be generated.",
      );
    }
  };

  const ensureSession = async () => {
    if (sessionId) return sessionId;
    const created = await beginFn();
    setSessionId(created.id);
    return created.id;
  };

  const startListening = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return toast.error("Use Chrome or Edge to test Sinhala speech recognition.");
    const recognition = new Recognition();
    recognition.lang = "si-LK";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = "";
      let interimText = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const item = event.results[index];
        if (item.isFinal) finalText += item[0].transcript;
        else interimText += item[0].transcript;
      }
      if (finalText)
        setTranscript((current) => [current, finalText].filter(Boolean).join(" ").trim());
      setInterim(interimText);
    };
    recognition.onerror = (event: SpeechRecognitionErrorLike) => {
      setListening(false);
      if (event.error !== "aborted")
        toast.error(`Microphone recognition stopped: ${event.error || "unknown error"}`);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setInterim("");
    setListening(true);
    recognition.start();
  };

  const stopListening = () => recognitionRef.current?.stop?.();

  const send = async () => {
    const message = [transcript, interim].filter(Boolean).join(" ").trim();
    if (!message) return toast.error("Speak or type a Sinhala message first.");
    const callerTurn: Turn = { role: "caller", text: message };
    setTurns((current) => [...current, callerTurn]);
    setTranscript("");
    setInterim("");
    setThinking(true);
    try {
      const activeSessionId = await ensureSession();
      const result = await replyFn({
        data: {
          sessionId: activeSessionId,
          message,
          turns: turns.map(({ role, text }) => ({ role, text })),
        },
      });
      setReply(result.reply);
      setTurns((current) => [
        ...current,
        {
          role: "receptionist",
          text: result.reply.sinhala,
          english: result.reply.english,
          latency: result.latency,
          intent: result.reply.intent,
        },
      ]);
      await speak(result.reply.sinhala);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The Sinhala response could not be generated.",
      );
    } finally {
      setThinking(false);
    }
  };

  const reset = () => {
    recognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    setSessionId(null);
    setTranscript("");
    setInterim("");
    setReply(null);
    setTurns([
      {
        role: "receptionist",
        text: greeting,
        english: "Thank you for calling eTOP. Maya with you. How can I help?",
      },
    ]);
    setScores({ recognition: 0, understanding: 0, pronunciation: 0, naturalness: 0 });
  };

  const score = async (key: keyof SinhalaLabScores, value: number) => {
    const next = { ...scores, [key]: value };
    setScores(next);
    try {
      const activeSessionId = await ensureSession();
      await saveScoresFn({ data: { sessionId: activeSessionId, scores: next } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The test score could not be saved.");
    }
  };

  const speechLabel = sinhalaVoices[0]
    ? sinhalaVoices[0].name
    : speechProvider === "azure"
      ? "Azure · Thilini"
      : speechProvider === "openai"
        ? "OpenAI Sinhala voice"
        : speechProvider === "elevenlabs"
          ? "ElevenLabs · experimental"
          : "Not connected";

  return (
    <div className="-m-4 flex h-[calc(100%+2rem)] min-w-0 flex-col bg-[#f7f8fb] md:-m-6 md:h-[calc(100%+3rem)]">
      <HeaderPortal>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            to="/app/reception"
            className="grid h-8 w-8 place-items-center rounded-lg border bg-white hover:bg-slate-50"
            aria-label="Back to Reception"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-base font-bold">
              <Languages className="h-5 w-5 text-violet-600" /> Sinhala Voice Lab
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Native-speaker reliability test · si-LK
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-[11px] font-medium text-emerald-700 sm:flex">
            <CheckCircle2 className="h-3.5 w-3.5" />{" "}
            {restoring ? "Loading saved test…" : sessionId ? "Saved to Supabase" : "Ready to save"}
          </span>
          <Button size="sm" variant="outline" onClick={reset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> New test
          </Button>
        </div>
      </HeaderPortal>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="flex min-h-0 flex-col border-r">
          <div className="grid shrink-0 gap-3 border-b bg-white p-4 sm:grid-cols-3">
            <Capability
              label="Sinhala recognition"
              value={recognitionSupported ? "Ready in browser" : "Unavailable"}
              ready={recognitionSupported}
            />
            <Capability
              label="Sinhala voice"
              value={speechLabel}
              ready={sinhalaVoices.length > 0 || Boolean(speechProvider)}
            />
            <Capability label="Reception intelligence" value="Existing CRM AI" ready />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            <div className="mx-auto max-w-3xl space-y-4">
              <div className="rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-violet-600" /> Test as a Sinhala-only customer
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Ask about a product, explain a requirement, or give your contact details
                  naturally. Speak only Sinhala. No English is required.
                </p>
              </div>

              {turns.map((turn, index) => (
                <div
                  key={`${turn.role}-${index}`}
                  className={cn("flex", turn.role === "caller" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[84%] rounded-2xl px-4 py-3 shadow-sm",
                      turn.role === "caller"
                        ? "rounded-br-md bg-slate-950 text-white"
                        : "rounded-bl-md border bg-white",
                    )}
                  >
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-60">
                      {turn.role === "caller" ? "Caller" : "Maya · Sinhala"}
                    </p>
                    <p lang="si" className="text-[15px] leading-7">
                      {turn.text}
                    </p>
                    {turn.english && (
                      <p className="mt-2 border-t pt-2 text-[11px] leading-4 opacity-60">
                        Internal translation: {turn.english}
                      </p>
                    )}
                    {turn.role === "receptionist" && (
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void speak(turn.text)}
                          disabled={speaking}
                          className="flex items-center gap-1 text-[11px] font-medium text-violet-600"
                        >
                          <Play className="h-3 w-3" /> {speaking ? "Speaking…" : "Play"}
                        </button>
                        {turn.latency != null && (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock3 className="h-3 w-3" /> {(turn.latency / 1000).toFixed(1)}s AI
                            response
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-violet-500" /> Maya is
                  preparing a Sinhala reply…
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t bg-white p-4">
            <div className="mx-auto max-w-3xl">
              <Textarea
                lang="si"
                value={[transcript, interim].filter(Boolean).join(" ")}
                onChange={(event) => {
                  setTranscript(event.target.value);
                  setInterim("");
                }}
                placeholder="සිංහලෙන් කතා කරන්න, නැත්නම් මෙහි ටයිප් කරන්න…"
                className="min-h-20 resize-none border-slate-200 text-[15px] leading-6 shadow-sm"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={listening ? "destructive" : "outline"}
                  onClick={listening ? stopListening : startListening}
                  disabled={!recognitionSupported}
                >
                  {listening ? (
                    <CircleStop className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Mic className="mr-1.5 h-4 w-4" />
                  )}
                  {listening ? "Stop listening" : "Speak Sinhala"}
                </Button>
                <Button
                  type="button"
                  onClick={send}
                  disabled={thinking || ![transcript, interim].some((value) => value.trim())}
                  className="bg-slate-950 hover:bg-slate-800"
                >
                  <Send className="mr-1.5 h-4 w-4" /> {thinking ? "Responding…" : "Send to Maya"}
                </Button>
                {listening && (
                  <span className="ml-1 flex items-center gap-1.5 text-xs font-medium text-rose-600">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> Listening in
                    Sinhala
                  </span>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="min-h-0 overflow-y-auto bg-white p-5">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-semibold">Native speaker scorecard</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            After one complete conversation, ask the tester to score what they actually experienced.
          </p>
          <div className="mt-5 space-y-5">
            <Score
              label="Speech recognition"
              hint="Did the transcript match the caller?"
              value={scores.recognition}
              onChange={(value) => void score("recognition", value)}
            />
            <Score
              label="Understanding"
              hint="Did Maya understand the request?"
              value={scores.understanding}
              onChange={(value) => void score("understanding", value)}
            />
            <Score
              label="Pronunciation"
              hint="Was the Sinhala easy to understand?"
              value={scores.pronunciation}
              onChange={(value) => void score("pronunciation", value)}
            />
            <Score
              label="Naturalness"
              hint="Did it sound like a real conversation?"
              value={scores.naturalness}
              onChange={(value) => void score("naturalness", value)}
            />
          </div>
          <div
            className={cn(
              "mt-6 rounded-2xl border p-4",
              average >= 4 ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Overall pilot score
            </p>
            <p className="mt-1 text-3xl font-bold">
              {average ? average.toFixed(1) : "—"}
              <span className="text-sm font-normal text-muted-foreground"> / 5</span>
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {average >= 4
                ? "Strong enough to continue with the Azure production speech path."
                : average
                  ? "Keep testing. A score below 4 needs speech-layer tuning before live calls."
                  : "Score all four areas after the test."}
            </p>
          </div>
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            Every turn and score is saved in Supabase.{" "}
            {speechProvider === "azure"
              ? "Azure provides the Sinhala voice."
              : speechProvider === "openai"
                ? "OpenAI currently provides the Sinhala voice."
                : speechProvider === "elevenlabs"
                  ? "ElevenLabs playback is experimental for Sinhala; score pronunciation carefully."
                  : "Connect Azure Speech or OpenAI to enable spoken replies on this computer."}
          </div>
          {reply && (
            <p className="mt-4 text-[11px] text-muted-foreground">
              Last detected intent:{" "}
              <span className="font-medium text-foreground">{reply.intent}</span>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Capability({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-slate-50/60 px-3 py-2.5">
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full",
          ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
        )}
      >
        {ready ? <CheckCircle2 className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-xs font-medium">{value}</p>
      </div>
    </div>
  );
}

function Score({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">{label}</p>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <span className="text-sm font-bold">{value || "—"}</span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={cn(
              "h-8 rounded-lg border text-xs font-semibold transition-colors",
              value === score
                ? "border-violet-600 bg-violet-600 text-white"
                : "bg-white hover:border-violet-300 hover:bg-violet-50",
            )}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}
