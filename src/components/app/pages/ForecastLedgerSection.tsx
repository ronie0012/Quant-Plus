import { useQuery } from "@tanstack/react-query";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip } from "@/components/app/pages/workspace";
import { fetchScoreboard } from "@/lib/forecast-api";

const num = (value: number | null | undefined, digits = 3) =>
  value == null ? "—" : value.toFixed(digits);
const pct = (value: number | null | undefined) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

/** Forward-only scoreboard of the hash-chained Forecast Card ledger. */
export function ForecastLedgerSection() {
  const board = useQuery({
    queryKey: ["forecast-scoreboard"],
    queryFn: ({ signal }) => fetchScoreboard(signal),
    staleTime: 300_000,
    retry: false,
  });
  if (board.isLoading) return <Skeleton className="h-40" />;
  if (board.isError || !board.data)
    return (
      <EmptyState
        title="Forecast ledger unavailable"
        hint={board.error?.message ?? "Retry shortly."}
        onRetry={() => void board.refetch()}
      />
    );
  const b = board.data;
  const forecasters = Object.entries(b.forecasters);
  return (
    <Card>
      <CardHead
        title="AI forecast ledger"
        meta="Silicon-crowd Forecast Cards · locked before outcomes · scored only after they mature"
        action={
          <Pill tone={b.chain.valid ? "positive" : "negative"}>
            {b.chain.valid ? `chain verified · ${b.chain.checked}` : "chain BROKEN"}
          </Pill>
        }
      />
      <div className="space-y-5 p-5">
        <MetricStrip
          items={[
            {
              label: "Locked forecasts",
              value: b.recorded,
              note: `${b.scored} scored · ${b.abstained} abstained`,
            },
            {
              label: "Brier skill vs 50/50",
              value: num(b.brier_skill_vs_climatology),
              note: `Brier ${num(b.brier)} · log-loss ${num(b.log_loss)}`,
              ...(b.brier_skill_vs_climatology == null
                ? {}
                : { tone: b.brier_skill_vs_climatology > 0 ? "positive" : "warning" }),
            },
            {
              label: "80% range coverage",
              value: pct(b.interval_80_coverage),
              note: `CRPS ${num(b.crps, 4)} (lower is better)`,
            },
            {
              label: "Sector tournament IC",
              value: num(b.tournament_ic.mean_ic),
              note: `${b.tournament_ic.days} of 45 days · t ${num(b.tournament_ic.t_stat, 2)} · ${b.tournament_ic.gate}`,
            },
          ]}
        />
        <p className="text-sm text-muted-foreground">{b.claim}.</p>
        <div className="grid gap-5 md:grid-cols-3">
          <Table
            title="Calibration (forecast vs observed)"
            head={["Bin", "n", "Mean p", "Observed"]}
            rows={b.reliability.map((r) => [
              `${r.bin * 10}–${r.bin * 10 + 10}%`,
              String(r.n),
              pct(r.mean_p),
              pct(r.observed),
            ])}
          />
          <Table
            title="Answering only the most confident"
            head={["Coverage", "n", "Brier"]}
            rows={b.coverage_curve.map((r) => [pct(r.coverage), String(r.n), num(r.brier)])}
          />
          <Table
            title="Forecasters (skill vs 50/50)"
            head={["Forecaster", "n", "Skill"]}
            rows={forecasters.map(([name, s]) => [
              name.replaceAll("_", " "),
              String(s.n),
              num(s.skill),
            ])}
          />
        </div>
      </div>
    </Card>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing settled yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              {head.map((h) => (
                <th key={h} className="pb-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono num-tabular">
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) => (
                  <td key={i} className="py-0.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
