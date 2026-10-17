/**
 * Platform Trust Score. The overall score is decomposable and never hides an
 * unavailable capability: unavailable components are excluded from the
 * average but listed beside it, and the overall label degrades when any
 * component is unavailable.
 */
export type TrustComponent = {
  key: string;
  label: string;
  /** 0-100, or null when the capability is unavailable. */
  score: number | null;
  status: "OK" | "DEGRADED" | "UNAVAILABLE";
  detail: string;
  weight: number;
};

export type TrustScore = {
  overall: number | null;
  label: "TRUSTED" | "PARTIAL" | "DEGRADED";
  available: TrustComponent[];
  unavailable: TrustComponent[];
  summary: string;
};

export function trustScore(components: TrustComponent[]): TrustScore {
  const available = components.filter((c) => c.score != null && c.status !== "UNAVAILABLE");
  const unavailable = components.filter((c) => c.score == null || c.status === "UNAVAILABLE");
  const weight = available.reduce((t, c) => t + c.weight, 0);
  const overall = weight
    ? Math.round(available.reduce((t, c) => t + c.score! * c.weight, 0) / weight)
    : null;
  const degraded = available.filter((c) => c.status === "DEGRADED" || (c.score ?? 0) < 70);
  const label: TrustScore["label"] =
    overall == null || overall < 70 || degraded.length > available.length / 2
      ? "DEGRADED"
      : unavailable.length || degraded.length
        ? "PARTIAL"
        : "TRUSTED";
  const summary = [
    overall == null
      ? "No measurable component."
      : `${overall}% across ${available.length} measured components.`,
    unavailable.length ? `Unavailable: ${unavailable.map((c) => c.label).join(", ")}.` : "",
    degraded.length ? `Degraded: ${degraded.map((c) => c.label).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { overall, label, available, unavailable, summary };
}

/** Freshness score: 100 at or below `good` seconds, 0 at or beyond `bad` seconds. */
export function freshnessScore(
  ageSeconds: number | null,
  good: number,
  bad: number,
): number | null {
  if (ageSeconds == null || !Number.isFinite(ageSeconds)) return null;
  if (ageSeconds <= good) return 100;
  if (ageSeconds >= bad) return 0;
  return Math.round(100 * (1 - (ageSeconds - good) / (bad - good)));
}

/** Share of non-null required fields across rows, 0-100. */
export function fieldCompleteness<T extends Record<string, unknown>>(
  rows: T[],
  fields: (keyof T)[],
) {
  if (!rows.length || !fields.length) return null;
  let present = 0;
  for (const row of rows) for (const f of fields) if (row[f] != null) present++;
  return Math.round((present / (rows.length * fields.length)) * 100);
}
