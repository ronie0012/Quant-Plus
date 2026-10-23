import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { ProgressBar, Segmented } from "@/components/app/pages/workspace";
import { ForecastPanels } from "@/components/app/stocks/ForecastPanels";
import {
  fetchForecast,
  fetchScoreboard,
  generateForecast,
  priceBand,
  type Forecast,
  type ForecastHorizon,
} from "@/lib/forecast-api";

const pct = (value: number | null | undefined, digits = 0) =>
  value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
const signedPct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

/** Calibrated, forward-scored AI forecast. Probabilities, ranges and abstentions — never orders. */
export function ForecastCard({ symbol, lastPrice }: { symbol: string; lastPrice: number | null }) {
  const [horizon, setHorizon] = useState<ForecastHorizon>(5);
  const client = useQueryClient();
  const key = ["forecast", symbol, horizon];
  const forecast = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => fetchForecast(symbol, horizon, signal),
    staleTime: 60_000,
    retry: false,
  });
  const scoreboard = useQuery({
    queryKey: ["forecast-scoreboard"],
    queryFn: ({ signal }) => fetchScoreboard(signal),
    staleTime: 300_000,
    retry: false,
  });
  const generate = useMutation({
    mutationFn: () => generateForecast(symbol, horizon),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: ["forecast-scoreboard"] });
    },
    // The backend keeps generating after a dropped connection and may still lock the card.
    onError: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ["forecast-scoreboard"] });
    },
  });
  const card = forecast.data?.forecast;

  return (
    <Card delay={200}>
      <CardHead
        title="AI forecast"
        meta={`Silicon crowd · blind evidence · vs NIFTY 50 · next ${horizon} sessions`}
        action={
          <Segmented
            label="Forecast horizon"
            items={["5D", "20D"]}
            value={`${horizon}D`}
            onChange={(value: string) => setHorizon(value === "20D" ? 20 : 5)}
          />
        }
      />
      {forecast.isLoading ? (
        <Skeleton className="m-5 h-40" />
      ) : forecast.isError ? (
        <EmptyState
          title="Forecast unavailable"
          hint={forecast.error.message}
          onRetry={() => void forecast.refetch()}
        />
      ) : card ? (
        <>
          <ForecastBody card={card} lastPrice={lastPrice} />
          <ForecastPanels card={card} />
        </>
      ) : (
        <div className="p-5 text-sm text-muted-foreground">
          No forecast is locked for this stock and horizon yet.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          {scoreboard.data
            ? `${scoreboard.data.recorded} locked · ${scoreboard.data.scored} scored · ${
                scoreboard.data.brier_skill_vs_climatology == null
                  ? "no skill claim yet"
                  : `Brier skill ${scoreboard.data.brier_skill_vs_climatology.toFixed(3)}`
              } · ledger ${scoreboard.data.chain.valid ? "verified" : "BROKEN"}`
            : "Track record loading"}
        </span>
        <button
          type="button"
          onClick={() => generate.mutate()}
          disabled={generate.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          {generate.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {card ? "Refresh forecast" : "Generate forecast"}
        </button>
      </div>
      {generate.isError && (
        <p role="alert" className="px-5 pb-3 text-xs text-muted-foreground">
          {generate.error.message}
        </p>
      )}
    </Card>
  );
}

function ForecastBody({ card, lastPrice }: { card: Forecast; lastPrice: number | null }) {
  if (card.abstain) {
    return (
      <div className="space-y-2 p-5">
        <Pill tone="warning">Abstained</Pill>
        <p className="text-sm">The crowd declined to forecast: {card.abstain_reason}.</p>
        <p className="text-xs text-muted-foreground">
          Abstaining is scored separately and never counted as a prediction.
        </p>
      </div>
    );
  }
  const p = card.p_outperform ?? 0.5;
  const band = lastPrice ? priceBand(card, lastPrice) : null;
  const agree = card.contributions.filter((c) => (c.p - 0.5) * (p - 0.5) > 0).length;
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-4xl num-tabular">{pct(p)}</p>
          <p className="text-xs text-muted-foreground">chance of beating NIFTY 50</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Pill tone={p >= 0.55 ? "positive" : p <= 0.45 ? "negative" : "neutral"}>
            {p >= 0.55
              ? "Leaning outperform"
              : p <= 0.45
                ? "Leaning underperform"
                : "No clear edge"}
          </Pill>
          <span className="text-[11px] text-muted-foreground">{card.calibration}</span>
        </div>
      </div>
      <ProgressBar value={p * 100} />
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat
          label="80% excess range"
          value={`${signedPct(card.quantiles["0.1"])} to ${signedPct(card.quantiles["0.9"])}`}
        />
        <Stat
          label="Price band*"
          value={band ? `₹${band.low.toFixed(0)}–₹${band.high.toFixed(0)}` : "—"}
        />
        <Stat label="Drawdown ≥5%" value={pct(card.risk.p_drawdown_5pct)} />
        <Stat label="Event shock" value={pct(card.p_event_shock)} />
        <Stat label="Agents agreeing" value={`${agree} of ${card.contributions.length}`} />
        <Stat label="Disagreement" value={card.disagreement?.toFixed(3) ?? "—"} />
        <Stat
          label="Robustness"
          value={card.robustness == null ? "—" : `${Math.round(card.robustness * 100)}%`}
        />
        <Stat label="Matures" value={card.matures_on ?? "calendar unverified"} />
      </dl>
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Forecasters
        </p>
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {card.contributions.map((c) => (
            <li key={c.forecaster} className="flex justify-between gap-2">
              <span className="truncate">{c.forecaster.replaceAll("_", " ")}</span>
              <span className="font-mono num-tabular">
                {pct(c.p)} · w {c.weight.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {card.falsifiers.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            This forecast is wrong if
          </p>
          <ul className="space-y-0.5 font-mono text-xs">
            {card.falsifiers.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        *Price band assumes NIFTY is flat. Locked {new Date(card.recorded_at).toLocaleString()} ·
        hash {card.hash.slice(0, 12)} · {card.authority.replace("_", " ").toLowerCase()}, not
        investment advice.
        {card.outcome &&
          ` Settled: ${signedPct(card.outcome.excess_return)} vs NIFTY (${
            card.outcome.outperformed ? "outperformed" : "underperformed"
          }).`}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono num-tabular">{value}</dd>
    </div>
  );
}
