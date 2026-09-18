import { useEffect, useRef, useState } from "react";
import {
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  MessageSquare,
  Pause,
  Play,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import { MetricStrip, PageIntro, ProgressBar, SparkChart } from "./workspace";
import {
  relativeTime,
  useAnalyses,
  useInstruments,
  useNews,
  type Analysis,
} from "@/hooks/use-dashboard-data";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function verdictTone(v: string) {
  return v.toUpperCase() === "BUY"
    ? ("positive" as const)
    : v.toUpperCase() === "SELL"
      ? ("negative" as const)
      : ("neutral" as const);
}
export function DecisionsPage() {
  const { data, isLoading, isError, refetch } = useAnalyses();
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [states, setStates] = useState<Record<string, string>>({});
  const active = selected ?? data?.[0] ?? null;
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Decision intelligence"
        title="From signal to decision."
        body="Review committee verdicts with conviction, risk, rationale and a clear audit trail."
        action={
          <Button size="sm" className="font-mono text-[10px] uppercase tracking-[.14em]">
            <Sparkles />
            New analysis
          </Button>
        }
      >
        <MetricStrip
          items={[
            { label: "Decision queue", value: data?.length ?? 0 },
            {
              label: "High conviction",
              value: data?.filter((x) => x.conviction >= 80).length ?? 0,
              tone: "positive",
            },
            {
              label: "Needs review",
              value: Object.values(states).filter((x) => x === "Review").length,
              tone: "warning",
            },
            { label: "Method", value: "Committee", tone: "primary" },
          ]}
        />
      </PageIntro>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <Card>
          <CardHead
            title="Decision queue"
            meta="Latest committee outputs"
            action={<SourceTag label="Simulated analyses" />}
          />
          {isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : isError ? (
            <EmptyState
              title="Queue unavailable"
              hint="Analysis records could not be loaded."
              onRetry={() => void refetch()}
            />
          ) : (
            <div className="divide-y divide-border">
              {data?.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={cn(
                    "dash-rise group w-full px-5 py-4 text-left transition-colors hover:bg-panel-elevated/60",
                    active?.id === a.id && "bg-primary/10",
                  )}
                  style={{ ["--d" as string]: `${i * 60}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[12px] tracking-[.14em]">{a.symbol}</span>
                    <Pill tone={verdictTone(a.verdict)}>{a.verdict}</Pill>
                    <span className="ml-auto font-mono text-[10px] text-subtle">
                      {relativeTime(a.created_at)}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-4">
                    <ProgressBar
                      value={a.conviction}
                      tone={verdictTone(a.verdict) === "negative" ? "negative" : "primary"}
                    />
                    <span className="font-mono text-[11px]">{a.conviction}% conviction</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card glow className="h-fit xl:sticky xl:top-[88px]">
          <CardHead
            title={active ? `${active.symbol} decision` : "Decision inspector"}
            meta={
              active ? `Committee verdict · ${relativeTime(active.created_at)}` : "Select a record"
            }
          />
          {active ? (
            <div className="p-5">
              <div className="flex items-center justify-between">
                <Pill tone={verdictTone(active.verdict)}>{active.verdict}</Pill>
                <Pill tone={active.risk.toLowerCase().includes("high") ? "warning" : "neutral"}>
                  Risk {active.risk}
                </Pill>
              </div>
              <p className="mt-5 text-[14px] leading-relaxed text-muted-foreground">
                {active.summary ?? "No committee rationale was stored for this decision."}
              </p>
              <div className="mt-6 space-y-4">
                {[
                  ["Evidence quality", active.conviction],
                  ["Counter-case", Math.max(20, 100 - active.conviction)],
                  ["Risk alignment", active.risk.toLowerCase().includes("high") ? 38 : 72],
                ].map(([l, v], i) => (
                  <div key={String(l)}>
                    <div className="mb-2 flex justify-between font-mono text-[9px] uppercase tracking-[.14em] text-subtle">
                      <span>{l}</span>
                      <span>{v}%</span>
                    </div>
                    <ProgressBar
                      value={Number(v)}
                      tone={i === 1 ? "warning" : "primary"}
                      delay={i * 100}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-7 grid grid-cols-3 gap-2">
                {["Review", "Accepted", "Archived"].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={states[active.id] === s ? "default" : "outline"}
                    onClick={() => setStates((x) => ({ ...x, [active.id]: s }))}
                    className="px-2 font-mono text-[8px] uppercase tracking-[.1em]"
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <p className="mt-4 text-[10px] leading-relaxed text-subtle">
                Workflow status is saved for this visit. It does not place or recommend a trade.
              </p>
            </div>
          ) : (
            <EmptyState title="No decision selected" hint="Choose an analysis from the queue." />
          )}
        </Card>
      </div>
    </div>
  );
}

export function HistoryPage() {
  const { data, isLoading } = useAnalyses();
  const [open, setOpen] = useState<string | null>(null);
  const groups = (data ?? []).reduce<Record<string, Analysis[]>>((a, x) => {
    const k = new Date(x.created_at).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    (a[k] ??= []).push(x);
    return a;
  }, {});
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Audit trail"
        title="Decision history"
        body="A chronological record of every committee output, with context preserved for review."
        status="Private account history"
      >
        <MetricStrip
          items={[
            { label: "Recorded analyses", value: data?.length ?? 0 },
            {
              label: "Buy verdicts",
              value: data?.filter((x) => x.verdict === "BUY").length ?? 0,
              tone: "positive",
            },
            {
              label: "Hold verdicts",
              value: data?.filter((x) => x.verdict === "HOLD").length ?? 0,
            },
            {
              label: "Sell verdicts",
              value: data?.filter((x) => x.verdict === "SELL").length ?? 0,
              tone: "negative",
            },
          ]}
        />
      </PageIntro>
      <Card>
        <CardHead title="Activity ledger" meta="Newest first" />
        {isLoading ? (
          <div className="p-5">
            <Skeleton className="h-52" />
          </div>
        ) : !data?.length ? (
          <EmptyState title="No history yet" hint="Completed analyses will appear here." />
        ) : (
          <div>
            {Object.entries(groups).map(([day, items]) => (
              <section key={day} className="border-b border-border">
                <h2 className="bg-background/30 px-5 py-2.5 font-mono text-[9px] uppercase tracking-[.18em] text-subtle">
                  {day}
                </h2>
                {items.map((a, i) => (
                  <div key={a.id} className="relative grid grid-cols-[24px_1fr] gap-3 px-5 py-4">
                    <span className="relative mt-1 flex h-5 w-5 items-center justify-center rounded-full border border-primary/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    <div>
                      <button
                        onClick={() => setOpen(open === a.id ? null : a.id)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="font-mono text-[11px]">{a.symbol}</span>
                        <Pill tone={verdictTone(a.verdict)}>{a.verdict}</Pill>
                        <span className="text-[11px] text-subtle">
                          Committee analysis completed
                        </span>
                        <span className="ml-auto font-mono text-[9px] text-subtle">
                          {new Date(a.created_at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 text-subtle transition-transform",
                            open === a.id && "rotate-180",
                          )}
                        />
                      </button>
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-500",
                          open === a.id ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="overflow-hidden">
                          <p className="mt-3 border-l border-border pl-4 text-[12px] leading-relaxed text-muted-foreground">
                            {a.summary ?? "No summary stored."} Conviction {a.conviction}%. Risk{" "}
                            {a.risk}.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

type Msg = { role: "user" | "assistant"; text: string };
const prompts = [
  "Summarise today's market regime",
  "Compare momentum across tracked indices",
  "Explain concentration risk in plain language",
  "Build a counter-case for the latest BUY verdict",
];
export function QuantAIPage() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  async function send(raw: string) {
    const message = raw.trim();
    if (!message || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "" }]);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body)
        throw new Error(
          res.status === 429
            ? "Quant AI is busy. Try again shortly."
            : "Quant AI could not answer.",
        );
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += value;
        setMessages((m) => {
          const n = [...m];
          n[n.length - 1] = { role: "assistant", text: acc };
          return n;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-[calc(100vh-132px)] flex-col gap-5">
      <PageIntro
        eyebrow="Quant AI · grounded reasoning"
        title="Ask the market."
        body="Explore market structure, portfolio risk and committee reasoning through an analytical copilot."
        action={<SourceTag label="Authenticated session" />}
      />
      <div className="grid min-h-[620px] flex-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <Card className="hidden xl:block">
          <CardHead title="Workflows" meta="Suggested analysis" />
          <div className="space-y-2 p-3">
            {prompts.map((p, i) => (
              <Button
                key={p}
                variant="ghost"
                onClick={() => void send(p)}
                className="h-auto w-full justify-start rounded-md border border-transparent px-3 py-3 text-left text-[11.5px] leading-relaxed whitespace-normal text-muted-foreground hover:border-border hover:text-foreground"
              >
                <span className="font-mono text-[9px] text-primary-soft">0{i + 1}</span>
                {p}
              </Button>
            ))}
          </div>
          <div className="m-4 border-t border-border pt-4">
            <p className="font-mono text-[9px] uppercase tracking-[.16em] text-subtle">Scope</p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Educational market analysis. No personalised investment advice or execution.
            </p>
          </div>
        </Card>
        <Card glow className="flex min-h-[560px] flex-col">
          <CardHead
            title="Conversation"
            meta="Reasoning over demonstrative context"
            action={<Pill tone="primary">AI online</Pill>}
          />
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <span className="relative grid h-14 w-14 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary-soft">
                  <span className="absolute inset-0 rounded-full border border-primary/20 pulse-ring" />
                  <BrainCircuit className="h-6 w-6" />
                </span>
                <h2 className="mt-5 text-lg">Start with a market question</h2>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                  Quant AI explains evidence, uncertainty and the limits of its conclusion.
                </p>
                <div className="mt-6 grid max-w-xl gap-2 sm:grid-cols-2 xl:hidden">
                  {prompts.slice(0, 4).map((p) => (
                    <Button
                      key={p}
                      variant="outline"
                      onClick={() => void send(p)}
                      className="h-auto py-3 text-[11px] whitespace-normal"
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "dash-rise max-w-[88%] rounded-lg border px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-auto border-primary/35 bg-primary/10"
                    : "border-border bg-background/30 text-muted-foreground",
                )}
              >
                <p className="mb-2 font-mono text-[8px] uppercase tracking-[.18em] text-subtle">
                  {m.role === "user" ? "You" : "Quant AI"}
                </p>
                {m.text || (busy ? "Reading market context…" : "")}
              </div>
            ))}
            {error && <p className="text-[12px] text-negative">{error}</p>}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="m-4 flex items-end gap-2 rounded-lg border border-border bg-background/40 p-2 focus-within:border-primary/50"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="Ask about markets, a symbol or portfolio risk…"
              className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-subtle"
            />
            <Button size="icon" disabled={busy || !input.trim()} aria-label="Send question">
              <Send />
            </Button>
          </form>
        </Card>
        <Card className="hidden xl:block">
          <CardHead title="Analysis context" meta="Inputs available" />
          <div className="space-y-5 p-5">
            {[
              ["Market data", "Connected", 100],
              ["Portfolio", "Private", 100],
              ["News context", "Available", 82],
              ["Live broker data", "Not connected", 12],
            ].map(([l, s, v], i) => (
              <div key={String(l)}>
                <div className="mb-2 flex justify-between text-[11px]">
                  <span>{l}</span>
                  <span className="font-mono text-[9px] text-subtle">{s}</span>
                </div>
                <ProgressBar value={Number(v)} tone={i === 3 ? "warning" : "primary"} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

const agents = [
  {
    name: "Fundamentals",
    role: "Business quality & valuation",
    score: 74,
    tone: "positive" as const,
  },
  { name: "Technical", role: "Price structure & momentum", score: 81, tone: "positive" as const },
  { name: "News", role: "Event and narrative risk", score: 62, tone: "primary" as const },
  { name: "Risk", role: "Downside & concentration", score: 46, tone: "warning" as const },
  { name: "Bear case", role: "Thesis-break conditions", score: 39, tone: "negative" as const },
  { name: "Portfolio", role: "Fit and exposure", score: 69, tone: "primary" as const },
];
export function CommitteePage() {
  const { data } = useAnalyses();
  const [symbol, setSymbol] = useState(data?.[0]?.symbol ?? "RELIANCE");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState(6);
  useEffect(() => {
    if (!running) return;
    setStage(0);
    const id = setInterval(
      () =>
        setStage((s) => {
          if (s >= agents.length) {
            setRunning(false);
            clearInterval(id);
            return s;
          }
          return s + 1;
        }),
      430,
    );
    return () => clearInterval(id);
  }, [running]);
  const analysis = data?.find((x) => x.symbol === symbol) ?? data?.[0];
  const consensus =
    analysis?.conviction ?? Math.round(agents.reduce((s, a) => s + a.score, 0) / agents.length);
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Multi-agent reasoning"
        title="Investment committee"
        body="Independent analytical perspectives converge into an inspectable verdict — including where they disagree."
        action={
          <Button
            onClick={() => setRunning(true)}
            disabled={running}
            size="sm"
            className="font-mono text-[10px] uppercase tracking-[.14em]"
          >
            <Users />
            {running ? "Committee running" : "Run committee"}
          </Button>
        }
      >
        <MetricStrip
          items={[
            { label: "Subject", value: symbol, tone: "primary" },
            {
              label: "Consensus",
              value: `${consensus}%`,
              tone: consensus >= 70 ? "positive" : "warning",
            },
            {
              label: "Verdict",
              value: analysis?.verdict ?? "Review",
              tone: analysis?.verdict === "BUY" ? "positive" : "primary",
            },
            { label: "Agents", value: agents.length },
          ]}
        />
      </PageIntro>
      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {data?.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={symbol === a.symbol ? "default" : "outline"}
            onClick={() => setSymbol(a.symbol)}
            className="shrink-0 font-mono text-[10px] tracking-[.12em]"
          >
            {a.symbol}
          </Button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
        <Card glow>
          <CardHead
            title="Committee chamber"
            meta={
              running
                ? `Stage ${Math.min(stage + 1, agents.length)} of ${agents.length}`
                : "Deliberation complete"
            }
            action={
              <Pill tone={running ? "primary" : "positive"}>
                {running ? "Processing" : "Consensus ready"}
              </Pill>
            }
          />
          <div className="relative grid gap-3 p-5 sm:grid-cols-2">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 grid-lines opacity-10"
            />
            {agents.map((a, i) => {
              const visible = !running || i < stage;
              return (
                <div
                  key={a.name}
                  className={cn(
                    "relative border border-border bg-background/35 p-4 transition-all duration-700",
                    visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-25",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center border border-border bg-panel-elevated">
                      <Bot className="h-4 w-4 text-primary-soft" />
                    </span>
                    <div>
                      <p className="text-[13px]">{a.name}</p>
                      <p className="mt-1 text-[10px] text-subtle">{a.role}</p>
                    </div>
                    <span className="ml-auto font-mono text-[15px]">
                      {visible ? `${a.score}%` : "—"}
                    </span>
                  </div>
                  <div className="mt-4">
                    <ProgressBar value={visible ? a.score : 2} tone={a.tone} />
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                    {visible
                      ? `${a.score >= 65 ? "Supportive" : "Cautious"} evidence within the current demonstrative context.`
                      : "Awaiting prior agents…"}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHead title="Consensus" meta="Weighted committee output" />
            <div className="p-6 text-center">
              <div
                className="relative mx-auto grid h-40 w-40 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(var(--color-primary) ${consensus * 3.6}deg,var(--color-border) 0)`,
                }}
              >
                <div className="grid h-[132px] w-[132px] place-items-center rounded-full bg-panel">
                  <div>
                    <p className="font-mono text-4xl">{consensus}</p>
                    <p className="mt-1 font-mono text-[8px] uppercase tracking-[.18em] text-subtle">
                      confidence
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">
                {analysis?.summary ?? "Committee output is based on simulated context."}
              </p>
            </div>
          </Card>
          <Card>
            <CardHead title="Primary disagreement" meta="What limits conviction" />
            <div className="flex gap-3 p-5">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Risk and bear-case agents remain below consensus. Validate downside conditions
                before interpreting the verdict.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function AgentActivityPage() {
  const [paused, setPaused] = useState(false);
  const { data: analyses } = useAnalyses();
  const tasks = [
    ...(analyses ?? []).map((a, i) => ({
      id: a.id,
      time: relativeTime(a.created_at),
      agent: agents[i % agents.length]?.name ?? "Quant",
      task: `Reviewed ${a.symbol} evidence`,
      status: "Complete",
    })),
    {
      id: "stream",
      time: "now",
      agent: "Market data",
      task: "Normalising instrument snapshots",
      status: paused ? "Paused" : "Running",
    },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Intelligence operations"
        title="Agent activity"
        body="Observe how analytical agents retrieve context, evaluate evidence and hand work to the committee."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPaused((x) => !x)}
            className="font-mono text-[10px] uppercase tracking-[.14em]"
          >
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause stream"}
          </Button>
        }
      >
        <MetricStrip
          items={[
            {
              label: "Agents online",
              value: paused ? 0 : agents.length,
              tone: paused ? "warning" : "positive",
            },
            { label: "Tasks completed", value: analyses?.length ?? 0 },
            {
              label: "Pipeline",
              value: paused ? "Paused" : "Healthy",
              tone: paused ? "warning" : "primary",
            },
            { label: "Data mode", value: "Simulated" },
          ]}
        />
      </PageIntro>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <Card>
          <CardHead
            title="Operations stream"
            meta="Latest agent events"
            action={<SourceTag label={paused ? "Stream paused" : "Monitoring"} />}
          />
          <div className="divide-y divide-border">
            {tasks.map((t, i) => (
              <div
                key={t.id}
                className="dash-rise grid grid-cols-[12px_1fr_auto] gap-3 px-5 py-4"
                style={{ ["--d" as string]: `${i * 70}ms` }}
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 rounded-full",
                    t.status === "Running"
                      ? "animate-pulse bg-primary"
                      : t.status === "Paused"
                        ? "bg-warning"
                        : "bg-positive",
                  )}
                />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[.14em]">{t.agent}</p>
                    <Pill
                      tone={
                        t.status === "Running"
                          ? "primary"
                          : t.status === "Paused"
                            ? "warning"
                            : "positive"
                      }
                    >
                      {t.status}
                    </Pill>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-muted-foreground">{t.task}</p>
                </div>
                <span className="font-mono text-[9px] text-subtle">{t.time}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-5">
          <Card glow>
            <CardHead title="Pipeline throughput" meta="Rolling operational view" />
            <div className="p-5">
              <SparkChart seed={76} height={150} className="h-36" />
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                {[
                  ["P50", "0.8s"],
                  ["P95", "2.4s"],
                  ["Errors", "0"],
                ].map((x) => (
                  <div key={x[0]} className="border border-border p-3">
                    <p className="font-mono text-[8px] uppercase text-subtle">{x[0]}</p>
                    <p className="mt-2 font-mono text-sm">{x[1]}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card>
            <CardHead title="Processing trace" meta="Current cycle" />
            <div className="space-y-4 p-5">
              {["Retrieve context", "Score factors", "Challenge thesis", "Aggregate verdict"].map(
                (x, i) => (
                  <div key={x} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid h-6 w-6 place-items-center rounded-full border text-[9px]",
                        paused
                          ? "border-border text-subtle"
                          : "border-primary/40 text-primary-soft",
                      )}
                    >
                      {paused ? <Clock3 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    </span>
                    <span className="text-[12px] text-muted-foreground">{x}</span>
                  </div>
                ),
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
