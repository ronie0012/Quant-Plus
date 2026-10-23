import { Bot, Loader2, RefreshCw } from "lucide-react";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import type { useStockPrediction } from "@/hooks/use-agent-stock";
import { formatNum } from "@/hooks/use-dashboard-data";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import type { Prediction } from "@/lib/agent-api";
import { completedPrediction, predictionRunning } from "@/hooks/prediction-query";

function PredictionReports({ research }: { research: Prediction }) {
  // Validation belongs to this session's reports, never the previous decision.
  const claimChecks = new Map(
    research.events
      .filter((event) => event.stage === "claim_validation")
      .map((event) => [event.agent, event]),
  );
  return Object.entries(research.reports).map(([name, report]) => (
    <details key={name} className="border-t border-border pt-3">
      <summary className="cursor-pointer text-xs capitalize text-primary-soft">
        <Bot className="mr-2 inline h-3 w-3" />
        {name.replaceAll("_", " ")} · self-rated {Math.round(report.confidence * 100)}/100
        {claimChecks.get(name) && (
          <span
            className={
              claimChecks.get(name)!.status === "verified"
                ? "ml-2 text-positive"
                : "ml-2 text-warning"
            }
          >
            ·{" "}
            {claimChecks.get(name)!.status === "verified"
              ? "numbers match its input data"
              : "states numbers not in its input data"}
          </span>
        )}
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{report.summary}</p>
    </details>
  ));
}

function analysisFailureMessage(status: string | undefined, detail?: string) {
  const value = `${status ?? ""} ${detail ?? ""}`.toLowerCase();
  if (value.includes("outoffunds") || value.includes("insufficient funds"))
    return "The AI provider has no available balance. Top up or restore the provider account, then retry analysis.";
  if (
    value.includes("providerunavailable") ||
    value.includes("api keys quarantined") ||
    value.includes("provider credentials")
  )
    return "The AI provider rejected all configured keys. Check the backend provider credentials, then retry analysis.";
  if (value.includes("tokencapbreach"))
    return "The AI analysis budget was reached. Retry later or ask the operator to review the provider budget.";
  return `Analysis could not complete (${status}). Retry to resume completed stages.`;
}

export function AgentPrediction({ analysis }: { analysis: ReturnType<typeof useStockPrediction> }) {
  const result = analysis.data;
  const running = predictionRunning(result);
  const failed = result?.status.startsWith("failed");
  const display = completedPrediction(result);
  const decision = display?.decision;
  const research = display;
  const latest = result?.events.at(-1);
  const partial = result?.status !== "done" ? result : undefined;
  const fresh =
    display?.serving?.freshness === "fresh" &&
    Date.parse(display.as_of) + Math.max(60, display.refresh_seconds) * 1_000 > Date.now();
  return (
    <Card className="[animation:none] opacity-100">
      <CardHead
        title="Quant AI view"
        meta={
          (display ?? result)
            ? `Analysis as of ${new Date((display ?? result)!.as_of).toLocaleString("en-IN")} · daily timeframe`
            : "Agentic AI analysis"
        }
        action={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh analysis status"
            onClick={() => void analysis.refetch()}
            disabled={analysis.isFetching || analysis.isRetrying}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />
      <div className="space-y-4 p-5" aria-live="polite">
        {display && result?.status !== "done" && (
          <p className="text-xs text-warning">
            Showing the last completed prediction from{" "}
            {new Date(display.as_of).toLocaleString("en-IN")}.{" "}
            {running
              ? analysis.error
                ? "New analysis status is unavailable."
                : "A new analysis is running."
              : "The new analysis has not completed."}
          </p>
        )}
        {display?.serving && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Pill tone={fresh ? "positive" : "warning"}>
              {fresh ? "Recent completed research" : "Older completed research"}
            </Pill>
            {display.serving.refresh_status !== "idle" && result?.status === "done" && (
              <span className="text-subtle">
                {display.serving.refresh_status === "capacity"
                  ? "Refresh waiting for analysis capacity"
                  : display.serving.refresh_status === "paused"
                    ? "Refresh paused by operator"
                    : display.serving.refresh_status === "unavailable"
                      ? "Refresh service unavailable"
                      : "Full analysis refreshing"}
              </span>
            )}
          </div>
        )}
        {(analysis.isPending || (running && !analysis.error)) && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {latest
              ? `${latest.agent.replaceAll("_", " ")} · ${latest.status}`
              : "Starting your agent analysis…"}
          </p>
        )}
        {analysis.isFetching && !analysis.isPending && !running && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking latest research status…
          </p>
        )}
        {latest && (
          <p className="text-xs text-subtle">
            Last saved stage: {latest.stage.replaceAll("_", " ")} · {latest.status}
            {" · "}
            <time dateTime={latest.ts}>{new Date(latest.ts).toLocaleString("en-IN")}</time>
          </p>
        )}
        {analysis.error && (
          <p
            role="alert"
            className="rounded-md border border-border bg-panel-elevated/40 px-3 py-2 text-[13px] text-muted-foreground"
          >
            {analysis.error.message.replace(/\.$/, "")}. Automatic status updates are paused.
            Refresh analysis status to reconnect.
            {display ? " The last completed research is retained." : ""}
          </p>
        )}
        {running && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-primary-soft">
              {Object.keys(result?.reports ?? {}).length} analyst reports received
            </p>
            <p className="mt-1 text-xs leading-relaxed text-subtle">
              Research can take several minutes. Completed findings appear as each analyst finishes.
            </p>
          </div>
        )}
        {failed && (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-negative">
              {analysisFailureMessage(result?.status, latest?.status)}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => analysis.retryAnalysis()}
              disabled={analysis.isRetrying}
            >
              Retry analysis
            </Button>
            {analysis.retryError && (
              <p role="alert" className="text-sm text-negative">
                {analysis.retryError.message}
              </p>
            )}
          </div>
        )}
        {decision && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Pill
                tone={
                  decision.action === "buy"
                    ? "positive"
                    : decision.action === "sell"
                      ? "negative"
                      : "neutral"
                }
              >
                {decision.action.toUpperCase()}
              </Pill>
              {display?.thesis && (
                <span
                  className="font-mono text-xs text-muted-foreground"
                  title="An agent opinion score, not a calibrated probability of being right"
                >
                  Agent opinion strength {Math.round(display.thesis.conviction * 100)}/100 ·
                  uncalibrated
                </span>
              )}
              <Pill>Research only</Pill>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {decision.rationale}
            </p>
            {display?.proposal &&
              display.proposal.direction !== "flat" &&
              decision.action !== "hold" && (
                <div className="flex flex-wrap gap-3 font-mono text-xs">
                  <span>Research entry ₹{formatNum(display.proposal.entry)}</span>
                  <span>Target ₹{formatNum(display.proposal.target)}</span>
                  <span>Stop ₹{formatNum(display.proposal.stop)}</span>
                </div>
              )}
          </>
        )}
        {research?.thesis && (
          <>
            {research.thesis.key_evidence.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-primary-soft">Evidence</p>
                <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                  {research.thesis.key_evidence.map((item, i) => (
                    <li key={i}>
                      {item}{" "}
                      <WhyButton
                        claim={{
                          id: `research-evidence:${research.as_of}:${i}`,
                          label: "Research evidence",
                          value: item,
                          statement: item,
                          source: { name: "Research session input" },
                          observation: { provider: "Research session", as_of: research.as_of },
                          calculation: {
                            formula: "Agent-reported evidence; not independently forecasted.",
                            inputs: [],
                          },
                          model_version: "research session v1",
                          page: "research",
                          instrument: research.instrument,
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {research.thesis.key_risks.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-warning">Risks</p>
                <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                  {research.thesis.key_risks.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {research?.challenge && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Devil’s advocate: {research.challenge.status}. {research.challenge.reasons.join(" ")}
          </p>
        )}
        {display && Object.keys(display.reports).length > 0 && (
          <div className="space-y-3" aria-label="Completed analyst reports">
            {partial && (
              <p className="text-xs text-subtle">Last completed analysis · analyst reports</p>
            )}
            <PredictionReports research={display} />
          </div>
        )}
        {partial &&
          (Object.keys(partial.reports).length > 0 || partial.thesis || partial.challenge) && (
            <div className="space-y-3" aria-label="New analysis findings">
              <p className="text-xs text-subtle">
                New analysis · provisional findings · not a final decision
              </p>
              <p className="font-mono text-[10px] text-subtle">
                Data cutoff {new Date(partial.as_of).toLocaleString("en-IN")}
              </p>
              <PredictionReports research={partial} />
              {partial.thesis && (
                <details className="border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs text-primary-soft">
                    Provisional synthesis
                  </summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                    {partial.thesis.key_evidence.map((item, index) => (
                      <li key={`e-${index}`}>{item}</li>
                    ))}
                    {partial.thesis.key_risks.map((item, index) => (
                      <li key={`r-${index}`}>Risk: {item}</li>
                    ))}
                  </ul>
                </details>
              )}
              {partial.challenge && (
                <p className="text-xs text-muted-foreground">
                  Provisional counter-case: {partial.challenge.status}.{" "}
                  {partial.challenge.reasons.join(" ")}
                </p>
              )}
            </div>
          )}
      </div>
      <dl className="grid gap-2 border-t border-border px-5 py-4 text-[11px] text-subtle sm:grid-cols-2">
        <div>
          <dt className="font-medium text-[11px] uppercase tracking-[0.06em]">Data cutoff</dt>
          <dd>
            {display?.serving?.data_cutoff
              ? new Date(display.serving.data_cutoff).toLocaleString("en-IN")
              : display?.as_of
                ? new Date(display.as_of).toLocaleString("en-IN")
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-[11px] uppercase tracking-[0.06em]">Forecast status</dt>
          <dd>
            Not a validated forecast. In the recorded baseline study (11 configurations) none beat
            the best constant baseline; calibration is not established.
          </dd>
        </div>
      </dl>
      <p className="border-t border-border px-5 py-4 text-[11.5px] leading-relaxed text-subtle">
        Produced by research agents from data available at the cutoff. Opinion and self-rated scores
        are not probabilities. Live quotes update separately. Research output does not place orders.
      </p>
    </Card>
  );
}
