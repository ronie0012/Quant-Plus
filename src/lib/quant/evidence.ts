/**
 * Evidence graph. Every important displayed number is a claim connected to
 * its source document, publication and availability times, the market
 * observation, the calculation, the model version, the user decision and the
 * outcome. Claims shown on screen register here so universal search and the
 * "Why am I seeing this?" explorer can find them.
 */
export type EvidenceClaim = {
  id: string;
  label: string;
  value: string;
  statement: string;
  source?: { name: string; url?: string | null; document?: string | null } | null;
  published_at?: string | null;
  available_at?: string | null;
  observation?: { provider: string; as_of: string | null; detail?: string | null } | null;
  calculation?: { formula: string; inputs: { name: string; value: string }[] } | null;
  model_version?: string | null;
  decision?: { label: string; at: string } | null;
  outcome?: { label: string; at?: string | null } | null;
  contradictions?: { source: string; statement: string }[];
  /** Whether this factor helped historically, with its sample. */
  history?: string | null;
  /** Workspace section that shows the claim, for search navigation. */
  page?: string | null;
  /** Optional instrument context used to keep search results on the stock workspace. */
  instrument?: string | null;
};

export type GraphNode = { kind: string; label: string; detail: string | null; missing: boolean };

/** The claim's graph as an ordered list of branches (Claim → …). */
export function claimBranches(claim: EvidenceClaim): GraphNode[] {
  const when = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : null;
  return [
    {
      kind: "Source document",
      label: claim.source?.name ?? "Not recorded",
      detail: claim.source?.document ?? claim.source?.url ?? null,
      missing: !claim.source,
    },
    {
      kind: "Publication time",
      label: when(claim.published_at) ?? "Source gives no publication time",
      detail: null,
      missing: !claim.published_at,
    },
    {
      kind: "Available-at time",
      label: when(claim.available_at) ?? "Not recorded",
      detail: null,
      missing: !claim.available_at,
    },
    {
      kind: "Market observation",
      label: claim.observation
        ? `${claim.observation.provider}${claim.observation.as_of ? ` · ${when(claim.observation.as_of)}` : ""}`
        : "No market observation",
      detail: claim.observation?.detail ?? null,
      missing: !claim.observation,
    },
    {
      kind: "Calculation",
      label: claim.calculation?.formula ?? "No calculation (direct observation or text)",
      detail: claim.calculation?.inputs.map((i) => `${i.name} = ${i.value}`).join(" · ") || null,
      missing: !claim.calculation,
    },
    {
      kind: "Model version",
      label: claim.model_version ?? "No model involved",
      detail: null,
      missing: false,
    },
    {
      kind: "User decision",
      label: claim.decision
        ? `${claim.decision.label} · ${when(claim.decision.at)}`
        : "Not linked to a decision",
      detail: null,
      missing: !claim.decision,
    },
    {
      kind: "Outcome",
      label: claim.outcome
        ? `${claim.outcome.label}${claim.outcome.at ? ` · ${when(claim.outcome.at)}` : ""}`
        : "No outcome yet",
      detail: null,
      missing: !claim.outcome,
    },
  ];
}

export type Knowability = { status: "BEFORE" | "AFTER" | "UNKNOWN"; text: string };

/** Was the claim's information available before the decision? */
export function knowabilityOf(
  claim: EvidenceClaim,
  decisionAt: string | null | undefined,
): Knowability {
  const decided = decisionAt ?? claim.decision?.at ?? null;
  const available = claim.available_at ?? claim.published_at ?? claim.observation?.as_of ?? null;
  if (!decided)
    return {
      status: "UNKNOWN",
      text: "No decision is linked, so there is nothing to compare against.",
    };
  if (!available)
    return {
      status: "UNKNOWN",
      text: "The availability time of this information was not recorded.",
    };
  const gap = Date.parse(decided) - Date.parse(available);
  if (!Number.isFinite(gap)) return { status: "UNKNOWN", text: "A timestamp could not be read." };
  const minutes = Math.round(Math.abs(gap) / 60_000);
  const span =
    minutes < 120
      ? `${minutes} min`
      : minutes < 2880
        ? `${Math.round(minutes / 60)} h`
        : `${Math.round(minutes / 1440)} days`;
  return gap >= 0
    ? { status: "BEFORE", text: `Yes. It was available ${span} before the decision.` }
    : {
        status: "AFTER",
        text: `No. It became available ${span} after the decision, so it could not have informed it.`,
      };
}

// ------------------------------------------------------------------ registry

const claims = new Map<string, EvidenceClaim>();
const listeners = new Set<() => void>();
let snapshot: EvidenceClaim[] = [];

export function registerClaim(claim: EvidenceClaim) {
  const previous = claims.get(claim.id);
  if (previous && JSON.stringify(previous) === JSON.stringify(claim)) return;
  claims.set(claim.id, claim);
  snapshot = [...claims.values()];
  for (const listener of listeners) listener();
}

export function subscribeClaims(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function claimSnapshot() {
  return snapshot;
}
