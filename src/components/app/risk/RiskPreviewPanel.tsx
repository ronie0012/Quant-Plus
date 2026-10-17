import { AlertTriangle, ShieldCheck, ShieldX } from "lucide-react";
import { Pill } from "@/components/app/cards";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { formatINR } from "@/hooks/use-dashboard-data";
import type { RiskPreview } from "@/lib/quant/risk-compiler";
import type { ProtectionResult } from "@/lib/quant/behavior";
import { cn } from "@/lib/utils";

const money = (value: number | null) => (value == null ? "Unknown" : formatINR(value));
const pct = (value: number | null, digits = 1) =>
  value == null ? "Unknown" : `${value.toFixed(digits)}%`;

/** Complete execution preview from the pre-trade risk compiler. */
export function RiskPreviewPanel({
  preview,
  protection,
  blocks,
  symbol,
  compact = false,
}: {
  preview: RiskPreview | null;
  protection: ProtectionResult | null;
  blocks: string[];
  symbol: string;
  compact?: boolean;
}) {
  if (!preview)
    return (
      <p
        role="status"
        className="border border-border bg-background/40 px-3 py-2 text-[11.5px] text-subtle"
      >
        Compiling execution preview… it needs a live quote for {symbol}.
      </p>
    );
  const observed = {
    provider: "Live quote + 1Y provider history",
    as_of: preview.observed_at,
  };
  const rows: {
    label: string;
    value: string;
    formula: string;
    inputs: { name: string; value: string }[];
  }[] = [
    {
      label: "Estimated fill range",
      value: `₹${preview.fill_range.best.toFixed(2)} – ₹${preview.fill_range.worst.toFixed(2)}`,
      formula: preview.fill_range.basis,
      inputs: [{ name: "reference", value: `₹${preview.reference_price}` }],
    },
    {
      label: "Spread cost",
      value: money(preview.spread_cost),
      formula: "Half the quoted bid-ask spread × quantity (market orders cross the spread).",
      inputs: [],
    },
    {
      label: "Expected slippage",
      value: money(preview.expected_slippage),
      formula: preview.slippage_basis,
      inputs: [{ name: "participation of ADV", value: pct(preview.participation_pct, 3) }],
    },
    {
      label: "Fees and taxes (entry)",
      value: money(preview.fees),
      formula: `Itemised delivery charges, schedule ${preview.fee_schedule ?? "unavailable"}.`,
      inputs: preview.fee_items.map((i) => ({ name: i.label, value: `₹${i.amount.toFixed(2)}` })),
    },
    {
      label: "Round-trip costs",
      value: money(preview.fees_round_trip),
      formula: "Entry charges plus the same-size exit charges at today's schedule.",
      inputs: [],
    },
    {
      label: "Liquidity impact",
      value:
        preview.participation_pct == null
          ? "Volume unknown"
          : `${preview.participation_pct.toFixed(3)}% of ADV${preview.top_of_book_pct != null ? ` · ${preview.top_of_book_pct}% of touch size` : ""}`,
      formula:
        "Order quantity ÷ 20-session average daily volume; and ÷ displayed size at the touch.",
      inputs: [],
    },
    {
      label: "Worst-case partial fill",
      value: `${preview.worst_partial_fill.quantity} shares (${preview.worst_partial_fill.pct}%)`,
      formula: preview.worst_partial_fill.note,
      inputs: [],
    },
    {
      label: "Position after trade",
      value: pct(preview.position_pct_after),
      formula: "Position value after the trade ÷ account equity after costs.",
      inputs: [],
    },
    {
      label: "Sector exposure after",
      value: pct(preview.sector_pct_after),
      formula: "Sum of holdings in the instrument's NSE industry ÷ equity.",
      inputs: preview.top_sector_after
        ? [
            {
              name: "largest sector",
              value: `${preview.top_sector_after.sector} ${preview.top_sector_after.pct}%`,
            },
          ]
        : [],
    },
    {
      label: "Beta-weighted exposure",
      value: preview.beta_exposure == null ? "Unknown" : `${preview.beta_exposure}% of equity`,
      formula: "120-session beta to NIFTY 50 × position value ÷ equity (market factor exposure).",
      inputs: [],
    },
    {
      label: "Stop distance and rupee risk",
      value:
        preview.planned_loss == null
          ? "No stop"
          : `${pct(preview.stop_distance_pct, 2)} · ${formatINR(preview.planned_loss)}`,
      formula: "(Entry − stop) × quantity + round-trip costs + slippage.",
      inputs: [],
    },
    {
      label: "Daily risk budget used",
      value:
        preview.daily_budget_used_pct == null
          ? "Unknown"
          : `${preview.daily_budget_used_pct}% · ${formatINR(preview.daily_budget_remaining)} left`,
      formula:
        "Planned loss ÷ daily loss limit; remaining = limit − today's loss − other open plans' risk.",
      inputs: [],
    },
  ];
  return (
    <section aria-label="Pre-trade risk compiler" className="space-y-3">
      <p
        className={cn(
          "border px-3 py-2.5 text-[12.5px] leading-relaxed",
          blocks.length ? "border-negative/40 bg-negative/10" : "border-primary/40 bg-primary/10",
        )}
      >
        <span className="flex items-start gap-2">
          {blocks.length ? (
            <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
          ) : (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-soft" />
          )}
          <span>
            {preview.narrative}
            <WhyButton
              className="ml-1 align-middle"
              claim={{
                id: `risk-narrative:${symbol}`,
                label: "Pre-trade risk summary",
                value: preview.planned_loss == null ? "No stop" : formatINR(preview.planned_loss),
                statement: preview.narrative,
                observation: observed,
                calculation: {
                  formula:
                    "Risk compiler: stop loss + costs; gap = stop × (1 − 95th-pct adverse gap); budget = loss ÷ daily limit",
                  inputs: [
                    { name: "planned loss", value: money(preview.planned_loss) },
                    { name: "gap loss", value: money(preview.gap_loss) },
                    { name: "sector after", value: pct(preview.sector_pct_after) },
                  ],
                },
                model_version: "risk-compiler v1",
                page: "orders",
              }}
            />
          </span>
        </span>
      </p>
      {blocks.length > 0 && (
        <ul role="alert" className="space-y-1">
          {blocks.map((block) => (
            <li key={block} className="flex gap-2 text-[11.5px] text-negative">
              <ShieldX className="mt-0.5 h-3 w-3 shrink-0" /> {block}
            </li>
          ))}
        </ul>
      )}
      {!compact && (
        <dl className="grid gap-x-4 gap-y-2 text-[12px] sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5"
            >
              <dt className="flex items-center gap-1 text-muted-foreground">
                {row.label}
                <WhyButton
                  claim={{
                    id: `risk:${symbol}:${row.label}`,
                    label: row.label,
                    value: row.value,
                    statement: `${row.label} for this ${preview.side.toLowerCase()} of ${symbol}: ${row.value}.`,
                    observation: observed,
                    calculation: { formula: row.formula, inputs: row.inputs },
                    model_version: "risk-compiler v1",
                    page: "orders",
                  }}
                />
              </dt>
              <dd className="text-right font-mono num-tabular">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div>
        <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
          Maximum loss by scenario
        </p>
        <ul className="mt-1.5 space-y-1 text-[12px]">
          {preview.scenarios.map((scenario) => (
            <li key={scenario.name} className="flex items-start justify-between gap-3">
              <span>
                {scenario.name}
                {!compact && (
                  <span className="block text-[10.5px] text-subtle">{scenario.basis}</span>
                )}
              </span>
              <span
                className={cn(
                  "font-mono num-tabular",
                  scenario.loss != null && scenario.loss > 0 && "text-negative",
                )}
              >
                {scenario.loss == null ? "Unknown" : formatINR(scenario.loss)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {preview.violations.filter((v) => v.severity === "WARN").length > 0 && (
        <ul className="space-y-1">
          {preview.violations
            .filter((v) => v.severity === "WARN")
            .map((violation) => (
              <li key={violation.message} className="flex gap-2 text-[11.5px] text-warning">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  <Pill tone="warning">{violation.code.replaceAll("_", " ")}</Pill>{" "}
                  {violation.message}
                </span>
              </li>
            ))}
        </ul>
      )}
      {protection?.prompts.map((prompt) => (
        <p key={prompt} className="text-[11.5px] text-primary-soft">
          {prompt}
        </p>
      ))}
      {preview.notes.map((note) => (
        <p key={note} className="text-[10.5px] text-subtle">
          {note}
        </p>
      ))}
    </section>
  );
}
