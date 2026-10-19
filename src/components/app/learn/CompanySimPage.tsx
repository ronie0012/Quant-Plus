import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Coffee, GraduationCap, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { PageIntro } from "@/components/app/pages/workspace";
import { useLearning } from "@/hooks/use-learning";
import { conceptById } from "@/lib/learn/concepts";
import {
  act,
  founderValue,
  FOUNDER_CAPITAL,
  LISTED_QUARTERS,
  marketCap,
  newCompany,
  ownership,
  PRIVATE_QUARTERS,
  view,
  type CompanyState,
} from "@/lib/learn/company-sim";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "quant-plus:be-the-company";
const rupees = (n: number | null) =>
  n == null ? "—" : `${n < 0 ? "−" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

function loadSaved(): CompanyState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompanyState) : null;
  } catch {
    return null;
  }
}

/**
 * "Be the Company": found a chai brand, sell a stake, run four quarters, list
 * in an IPO and watch your own share price react to your results.
 */
export function CompanySimPage() {
  const [state, setState] = useState<CompanyState | null>(null);
  const [name, setName] = useState("");
  const [ready, setReady] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveAttempt, setSaveAttempt] = useState(0);
  const learning = useLearning();
  const recorded = useRef(false);

  useEffect(() => {
    setState(loadSaved());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Session storage is a convenience only.
    }
  }, [state, ready]);
  useEffect(() => {
    if (learning.loading || state?.phase !== "DONE" || recorded.current) return;
    recorded.current = true;
    setSaveStatus("saving");
    void learning
      .completeCompany({
        name: state.name.slice(0, 60),
        multiple: Math.round(((founderValue(state) ?? 0) / FOUNDER_CAPITAL) * 10) / 10,
        ownership_pct: Math.round(ownership(state) * 1000) / 10,
      })
      .then(() => setSaveStatus("saved"))
      .catch(() => setSaveStatus("error"));
  }, [state, learning, saveAttempt]);

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Learn"
        title="Be the Company"
        body="Learn what a share means by running a chai brand. Make one decision at a time, then see how ownership, profit and market expectations change."
        status="Step 2 · About 10 minutes · Illustrative numbers"
        action={
          state && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 gap-1.5"
              onClick={() => setConfirmRestart(true)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Start over
            </Button>
          )
        }
      />
      {confirmRestart && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel p-4"
          role="group"
          aria-label="Restart simulation"
        >
          <p className="w-full text-sm">
            Restart this story? Your current simulation in this tab will be replaced. Completed
            learning credit is kept.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setConfirmRestart(false)}
          >
            Keep playing
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              recorded.current = false;
              setState(null);
              setName("");
              setSaveStatus("idle");
              setConfirmRestart(false);
            }}
          >
            Restart story
          </Button>
        </div>
      )}
      {!ready ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your story…
        </p>
      ) : !state ? (
        <Card glow className="mx-auto w-full max-w-xl">
          <form
            className="flex flex-col gap-4 px-5 py-6"
            onSubmit={(event) => {
              event.preventDefault();
              setState(newCompany(name, Math.floor(Math.random() * 1000) + 1));
            }}
          >
            <span className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-panel-elevated text-primary-soft">
              <Coffee className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[18px] font-semibold tracking-tight">Name your chai brand</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Start a company → run four private quarters → list in an IPO → run four listed
                quarters. No wallet funding or actual trades are involved.
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              Company name (optional)
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                placeholder="e.g. Kadak Chai Co."
                className="min-h-11 rounded-md border border-border-strong bg-background px-3 text-base text-foreground placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-primary"
              />
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Progress resumes in this browser tab. Leave the name blank to use “Chai Co”.
            </p>
            <Button type="submit" className="min-h-11 gap-1.5 self-start">
              Found the company
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </Card>
      ) : (
        <Simulation
          state={state}
          onChoose={(id) => setState((current) => current && act(current, id))}
          saveStatus={saveStatus}
          onRetry={() => {
            recorded.current = false;
            setSaveAttempt((attempt) => attempt + 1);
          }}
        />
      )}
    </div>
  );
}

function Simulation({
  state,
  onChoose,
  saveStatus,
  onRetry,
}: {
  state: CompanyState;
  onChoose: (id: string) => void;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onRetry: () => void;
}) {
  const step = view(state);
  const concept = step.concept ? conceptById(step.concept) : null;
  const totalSteps = 3 + PRIVATE_QUARTERS + LISTED_QUARTERS;
  const done = state.phase === "DONE";
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(`${state.phase}-${state.quarter}`);
  useEffect(() => {
    const current = `${state.phase}-${state.quarter}`;
    if (previousStep.current !== current) heading.current?.focus();
    previousStep.current = current;
  }, [state.phase, state.quarter]);
  const stepNumber =
    state.phase === "FOUNDING"
      ? 1
      : state.phase === "RAISE"
        ? 2
        : state.phase === "IPO"
          ? 3 + PRIVATE_QUARTERS
          : done
            ? totalSteps
            : 3 + state.quarter + (state.phase === "LISTED" ? 1 : 0);

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card glow>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                {done ? "Simulation complete" : `Decision ${stepNumber} of ${totalSteps}`}
              </p>
              <h2
                ref={heading}
                tabIndex={-1}
                className="mt-2 text-lg font-semibold break-words focus-visible:outline-2 focus-visible:outline-primary"
              >
                {step.title}
              </h2>
            </div>
            <Pill tone={state.share_price ? "primary" : "neutral"}>
              {state.share_price ? "Listed" : "Private"}
            </Pill>
          </div>
          <div className="flex flex-col gap-5 px-5 py-5">
            <p className="text-[14px] leading-relaxed text-muted-foreground">{step.story}</p>
            {step.choices.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {step.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    disabled={choice.disabled}
                    onClick={() => onChoose(choice.id)}
                    className="flex min-h-11 flex-col items-start gap-1 rounded-md border border-border px-3.5 py-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-transparent"
                  >
                    <span className="text-[13px] font-medium text-foreground">{choice.label}</span>
                    <span className="text-sm text-muted-foreground">
                      {choice.detail}
                      {choice.disabled ? " Unavailable this quarter." : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {done && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button asChild size="sm" className="min-h-11 gap-1.5">
                  <Link to="/app/$section" params={{ section: "tutor" }}>
                    Next: check your understanding
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost" className="min-h-11">
                  <Link to="/app/$section" params={{ section: "learn" }}>
                    Back to Learn
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost" className="min-h-11">
                  <Link to="/app/$section" params={{ section: "markets" }}>
                    Explore companies
                  </Link>
                </Button>
                {saveStatus === "saved" && <Pill tone="positive">Licence step complete</Pill>}
                {saveStatus === "saving" && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Saving completion…
                  </p>
                )}
                {saveStatus === "error" && (
                  <div role="alert" className="text-sm text-warning">
                    Could not save completion. Your story is still here.{" "}
                    <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
                      Retry saving completion
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        {concept && (
          <Card>
            <div className="flex gap-3 px-5 py-4">
              <GraduationCap
                className="mt-0.5 h-4 w-4 shrink-0 text-primary-soft"
                aria-hidden="true"
              />
              <div>
                <h3 className="text-sm font-semibold">New idea: {concept.title}</h3>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{concept.meaning}</p>
              </div>
            </div>
          </Card>
        )}

        {state.history.length > 0 && (
          <details className="rounded-lg border border-border bg-panel/80">
            <summary className="min-h-11 cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
              Review quarterly results · {state.history.length} quarters
            </summary>
            <QuarterTable state={state} />
            <ProfitBars state={state} />
          </details>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHead
            title={state.name}
            meta={`${state.outlets} stall${state.outlets > 1 ? "s" : ""}`}
          />
          <dl className="grid grid-cols-2 gap-px bg-border">
            {[
              ["Cash", rupees(state.cash)],
              ["You own", `${Math.round(ownership(state) * 1000) / 10}%`],
              ["Share price", rupees(state.share_price)],
              ["Your stake", rupees(founderValue(state))],
            ].map(([label, value]) => (
              <div key={label} className="bg-panel/80 px-4 py-3">
                <dt className="text-[11px] text-subtle">{label}</dt>
                <dd className="mt-1 text-sm font-semibold break-words num-tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <details className="rounded-lg border border-border bg-panel/80">
          <summary className="min-h-11 cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
            Ownership & valuation details
          </summary>
          <dl className="grid grid-cols-2 gap-4 px-5 pb-5 text-sm">
            {[
              ["Total shares", state.total_shares.toLocaleString("en-IN")],
              ["Your shares", state.founder_shares.toLocaleString("en-IN")],
              ["Market cap", rupees(marketCap(state))],
              ["P/E at IPO", state.pe == null ? "Not listed yet" : `${state.pe}×`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words num-tabular">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
        <details className="rounded-lg border border-border bg-panel/80">
          <summary className="min-h-11 cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
            Ideas you have met · {state.concepts.length} concepts
          </summary>
          <Card>
            <CardHead title="Ideas you have met" meta={`${state.concepts.length} concepts`} />
            <ul className="flex flex-wrap gap-1.5 px-5 py-4">
              {state.concepts.map((id) => (
                <li key={id}>
                  <Pill tone="primary">{conceptById(id)?.title ?? id}</Pill>
                </li>
              ))}
            </ul>
          </Card>
        </details>
      </div>
    </div>
  );
}

function ProfitBars({ state }: { state: CompanyState }) {
  const max = Math.max(1, ...state.history.map((q) => Math.abs(q.profit)));
  return (
    <Card>
      <CardHead title="Profit by quarter" meta="Before and after listing" />
      <div
        className="flex h-36 items-end gap-2 px-5 pt-4 pb-3"
        role="img"
        aria-label={`Profit by quarter. ${state.history.map((q) => `Q${q.quarter}: ${rupees(q.profit)}`).join(". ")}`}
      >
        {state.history.map((q) => (
          <div
            key={q.quarter}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            <span
              className={cn(
                "w-full rounded-sm",
                q.profit >= 0 ? "bg-positive/70" : "bg-negative/70",
                q.share_price != null && "ring-1 ring-primary/50",
              )}
              style={{ height: `${Math.max(4, (Math.abs(q.profit) / max) * 100)}%` }}
              title={`Q${q.quarter}: ${rupees(q.profit)}`}
            />
            <span className="text-[10px] text-subtle">Q{q.quarter}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function QuarterTable({ state }: { state: CompanyState }) {
  return (
    <Card>
      <CardHead title="Quarterly results" meta="What happened after each decision" />
      <div
        className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-primary"
        tabIndex={0}
        role="region"
        aria-label="Quarterly results table, scroll horizontally for all columns"
      >
        <table className="w-full min-w-[34rem] text-[12.5px]">
          <caption className="sr-only">
            Revenue, profit, expectations and share price after each decision. Newest quarter first.
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-subtle">
              <th className="px-5 py-2 font-medium">Quarter</th>
              <th className="px-3 py-2 font-medium">What happened</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-right font-medium">Profit</th>
              <th className="px-3 py-2 text-right font-medium">Expected</th>
              <th className="px-5 py-2 text-right font-medium">Share price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {[...state.history].reverse().map((q) => {
              const beat = q.expected_profit != null ? q.profit >= q.expected_profit : null;
              return (
                <tr key={q.quarter}>
                  <td className="px-5 py-2.5 text-muted-foreground">Q{q.quarter}</td>
                  <td className="max-w-[16rem] px-3 py-2.5 text-muted-foreground">
                    {q.event ?? "A quiet quarter."}
                  </td>
                  <td className="px-3 py-2.5 text-right num-tabular">{rupees(q.revenue)}</td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right num-tabular",
                      q.profit < 0 && "text-negative",
                    )}
                  >
                    {rupees(q.profit)}
                  </td>
                  <td className="px-3 py-2.5 text-right num-tabular text-subtle">
                    {rupees(q.expected_profit)}
                  </td>
                  <td
                    className={cn(
                      "px-5 py-2.5 text-right num-tabular",
                      beat === true && "text-positive",
                      beat === false && "text-negative",
                    )}
                  >
                    {rupees(q.share_price)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
