/**
 * Explainable screener rules.
 *
 * The UI can still show only passing candidates, but every candidate gets an
 * explicit outcome so missing data is not indistinguishable from a failed
 * rule. This mirrors the trader-skill workflow: a screen should explain why
 * an instrument passed, failed, or could not be evaluated.
 */

export type ScreenerFilters = {
  sector: string;
  minMomentum: number;
  maxVol: number;
  minConviction: number;
  verdict: string;
};

export type ScreenerCandidate = {
  sector: string;
  momentum: number | null;
  volatility: number | null;
  verdict: string;
  conviction: number | null;
};

export type ScreeningStatus = "PASS" | "FAIL" | "MISSING";

export type ScreeningEvaluation = {
  status: ScreeningStatus;
  reasons: string[];
};

const value = (metric: number) => (Number.isInteger(metric) ? String(metric) : metric.toFixed(1));

export function evaluateScreenerCandidate(
  candidate: ScreenerCandidate,
  filters: ScreenerFilters,
): ScreeningEvaluation {
  const failures: string[] = [];
  const missing: string[] = [];

  if (filters.sector !== "All" && candidate.sector !== filters.sector)
    failures.push(`Sector is ${candidate.sector}, not ${filters.sector}.`);

  if (filters.minMomentum > 0) {
    if (candidate.momentum == null)
      missing.push(`Momentum is unavailable; minimum ${filters.minMomentum} cannot be checked.`);
    else if (candidate.momentum < filters.minMomentum)
      failures.push(`Momentum ${value(candidate.momentum)} is below ${filters.minMomentum}.`);
  }

  if (filters.maxVol < 100) {
    if (candidate.volatility == null)
      missing.push(`Volatility is unavailable; maximum ${filters.maxVol} cannot be checked.`);
    else if (candidate.volatility > filters.maxVol)
      failures.push(`Volatility ${value(candidate.volatility)} is above ${filters.maxVol}.`);
  }

  if (filters.minConviction > 0) {
    if (candidate.conviction == null)
      missing.push(
        `Research conviction is unavailable; minimum ${filters.minConviction} cannot be checked.`,
      );
    else if (candidate.conviction < filters.minConviction)
      failures.push(
        `Research conviction ${value(candidate.conviction)} is below ${filters.minConviction}.`,
      );
  }

  if (filters.verdict !== "ANY") {
    const verdict = candidate.verdict.toUpperCase();
    if (!verdict || verdict === "UNAVAILABLE")
      missing.push(`Research verdict is unavailable; ${filters.verdict} cannot be checked.`);
    else if (verdict !== filters.verdict)
      failures.push(`Research verdict is ${verdict}, not ${filters.verdict}.`);
  }

  if (failures.length > 0) return { status: "FAIL", reasons: [...failures, ...missing] };
  if (missing.length > 0) return { status: "MISSING", reasons: missing };
  return { status: "PASS", reasons: ["Passes all active rules."] };
}
