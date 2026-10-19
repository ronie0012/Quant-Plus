import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, Search } from "lucide-react";
import { useStockPrediction } from "@/hooks/use-agent-stock";
import { AgentPrediction } from "@/components/app/stocks/AgentPrediction";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import { MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { completedPrediction, predictionRunning } from "@/hooks/prediction-query";

/** Committee and operations share the actual persisted research session. */
export function ResearchWorkspace({ activity = false }: { activity?: boolean }) {
  const [input, setInput] = useState("RELIANCE");
  const [symbol, setSymbol] = useState("RELIANCE");
  const analysis = useStockPrediction(symbol);
  const result = analysis.data;
  const running = predictionRunning(result);
  const completed = completedPrediction(result);
  const events = result?.events ?? [];
  const reports = Object.entries(result?.reports ?? {});
  const nextSymbol = input.trim().toUpperCase().replace(/\.NS$/, "");
  const valid = /^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(nextSymbol);
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Research agents"
        title={activity ? "Agent activity" : "Investment committee"}
        body={
          activity
            ? "Follow saved stage events and analyst findings from your research session."
            : "Inspect independent analyst findings, the counter-case and the final research decision."
        }
        action={
          <Link
            to="/app/stocks/$symbol"
            params={{ symbol }}
            className="text-xs text-primary-soft hover:underline"
          >
            Open {symbol} workspace →
          </Link>
        }
      >
        <MetricStrip
          items={[
            { label: "Instrument", value: symbol, tone: "primary" },
            {
              label: "Session",
              value: analysis.error
                ? "Status unavailable"
                : (result?.status ?? (analysis.isPending ? "Connecting" : "Unavailable")),
              tone: running ? "primary" : result?.status === "done" ? "positive" : "warning",
            },
            { label: "Analyst reports", value: reports.length },
            {
              label: "Decision",
              value: completed?.decision?.action.toUpperCase() ?? "Pending",
              tone: "primary",
            },
          ]}
        />
      </PageIntro>
      <form
        className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel/60 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) setSymbol(nextSymbol);
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-subtle" aria-hidden="true" />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={33}
            aria-label="NSE symbol for research"
            placeholder="Enter an NSE symbol"
            className="w-full bg-transparent p-2 font-mono text-sm outline-none"
          />
        </label>
        <Button type="submit" variant="outline" disabled={!valid}>
          Inspect research
        </Button>
        <span className="text-xs text-subtle">Daily timeframe · research only</span>
      </form>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <AgentPrediction key={symbol} analysis={analysis} />
        <Card>
          <CardHead
            title={activity ? "Operations stream" : "Analyst findings"}
            meta={activity ? `${events.length} saved events` : `${reports.length} reports received`}
            action={
              <Pill tone={running ? "primary" : "neutral"}>
                {analysis.error
                  ? "Updates paused"
                  : running
                    ? "Processing"
                    : result?.status === "done"
                      ? "Complete"
                      : result?.status.startsWith("failed")
                        ? "Failed"
                        : "Waiting"}
              </Pill>
            }
          />
          <div
            className="max-h-[720px] divide-y divide-border overflow-y-auto"
            tabIndex={0}
            aria-label="Research findings"
          >
            {activity ? (
              events.length ? (
                [...events].reverse().map((event, index) => (
                  <div key={`${event.ts}-${index}`} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs capitalize text-primary-soft">
                        {event.agent.replaceAll("_", " ")}
                      </span>
                      <Pill>{event.status}</Pill>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {event.stage.replaceAll("_", " ")}
                    </p>
                    <time
                      className="mt-2 block font-mono text-[10px] text-subtle"
                      dateTime={event.ts}
                    >
                      {new Date(event.ts).toLocaleString("en-IN")}
                    </time>
                  </div>
                ))
              ) : (
                <p className="p-5 text-sm text-subtle">
                  Events will appear when the agents start processing.
                </p>
              )
            ) : reports.length ? (
              reports.map(([name, report]) => (
                <div key={name} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary-soft" aria-hidden="true" />
                    <h2 className="text-sm capitalize">{name.replaceAll("_", " ")}</h2>
                    <span className="ml-auto font-mono text-xs text-subtle">
                      Self-rated {Math.round(report.confidence * 100)}/100
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {report.summary}
                  </p>
                </div>
              ))
            ) : (
              <p className="p-5 text-sm text-subtle">
                Completed findings will appear here. Research can take several minutes.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
