/** Conservative numeric validation against cited, typed evidence fields. */
const NUMBER = /(?<![A-Za-z_\d.])[-+−]?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?/g;
const CITATION = /\[([A-Z]{1,3}\d{1,3})\]/g;

export function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER)]
    .map((match) => Number(match[0].replace(/,/g, "").replace("−", "-")))
    .filter(Number.isFinite);
}

/** Rounding is allowed; changing the sign or silently converting units is not. */
export function supportedBy(claimed: number, evidence: number[]) {
  const places = String(claimed).split(".")[1]?.length ?? 0;
  const tolerance = 0.5 * 10 ** -places + 1e-9;
  return evidence.some(
    (value) => Math.sign(value) === Math.sign(claimed) && Math.abs(value - claimed) <= tolerance,
  );
}

type Fact = { value: number; field: string; entity: string | null };
type EvidenceItem = { id: string; data: unknown };

function numericFacts(value: unknown, field = "", entity: string | null = null): Fact[] {
  if (typeof value === "number" && Number.isFinite(value)) return [{ value, field, entity }];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => numericFacts(item, field, entity));
  const row = value as Record<string, unknown>;
  const symbol = typeof row["symbol"] === "string" ? row["symbol"] : entity;
  return Object.entries(row).flatMap(([key, item]) => numericFacts(item, key, symbol));
}

// Match the field closest to each figure. Unknown fields abstain rather than
// accepting a coincidental number elsewhere in a quote, news story or journal.
const FIELDS: Array<[RegExp, string[]]> = [
  [/\b(?:price|last traded at|last traded price|ltp)\b/gi, ["price", "ltp", "last_price"]],
  [/\b(?:last close|closing price|close)\b/gi, ["last_close", "close"]],
  [/\b(?:volume|traded volume)\b/gi, ["volume"]],
  [/\b(?:quantity|shares|hold|holding|holdings)\b/gi, ["quantity"]],
  [/\b(?:return|return_pct)\b/gi, ["return_pct"]],
  [/\b(?:change|change_pct)\b/gi, ["change_pct", "change_percent"]],
  [/\b(?:rsi|rsi14)\b/gi, ["rsi", "rsi14"]],
  [/\b(?:cash|cash balance)\b/gi, ["cash", "cash_balance"]],
  [/\b(?:available cash)\b/gi, ["available_cash"]],
  [/\b(?:reserved cash)\b/gi, ["reserved_cash"]],
  [/\b(?:bid)\b/gi, ["bid", "best_bid"]],
  [/\b(?:ask)\b/gi, ["ask", "best_ask"]],
];

function fieldsFor(prefix: string, facts: Fact[]) {
  let last = -1;
  let fields: string[] = [];
  const candidates: Array<[RegExp, string[]]> = [
    ...FIELDS,
    ...[...new Set(facts.map((fact) => fact.field))]
      .filter((field) => /^[a-z][a-z0-9_]*$/i.test(field))
      .map((field): [RegExp, string[]] => [
        new RegExp(`\\b${field.replaceAll("_", "[ _]")}\\b`, "gi"),
        [field],
      ]),
  ];
  for (const [pattern, names] of candidates) {
    for (const match of prefix.matchAll(pattern)) {
      if (match.index! > last) {
        last = match.index!;
        fields = names;
      }
    }
  }
  return fields;
}

export type GroundingReport = {
  figures_checked: number;
  unsupported_figures: number[];
  citations: string[];
  unknown_citations: string[];
};

export function checkAnswer(
  answer: string,
  evidenceText: string,
  evidenceIds: string[],
): GroundingReport {
  let items: EvidenceItem[] = [];
  try {
    const parsed: unknown = JSON.parse(evidenceText);
    items = Array.isArray(parsed)
      ? parsed.filter((item): item is EvidenceItem => !!item && typeof item.id === "string")
      : evidenceIds.length === 1
        ? [{ id: evidenceIds[0]!, data: parsed }]
        : [];
  } catch {
    // Unstructured evidence cannot establish a typed numeric fact.
  }
  const citations = [...new Set([...answer.matchAll(CITATION)].map((match) => match[1]!))];
  const unsupported: number[] = [];
  let checked = 0;
  const clauses = answer.replace(/^\s*\d+[.)]\s+/gm, "").split(/\n|(?<=[.!?])\s+/);
  for (const clause of clauses) {
    const clean = clause.replace(CITATION, (match) => " ".repeat(match.length));
    const entities = [
      ...new Set(
        items
          .flatMap((item) => numericFacts(item.data))
          .map((fact) => fact.entity)
          .filter(Boolean),
      ),
    ];
    for (const match of clean.matchAll(NUMBER)) {
      if (/^\s*\d+[.)]\s/.test(clean) && match.index === clean.search(/\d/)) continue;
      const prefix = clean.slice(0, match.index);
      let value = Number(match[0].replace(/,/g, "").replace("−", "-"));
      if (/[-−]\s+$/.test(prefix) && value > 0) value = -value;
      const citation = [...clause.slice(match.index! + match[0].length).matchAll(CITATION)][0]?.[1];
      const facts = items
        .filter((item) => item.id === citation)
        .flatMap((item) => numericFacts(item.data));
      checked++;
      const fields = fieldsFor(prefix, facts);
      const mentioned = entities.filter((symbol) =>
        new RegExp(`\\b${symbol!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(prefix),
      );
      const eligible = facts.filter(
        (fact) =>
          fields.includes(fact.field) &&
          (fact.entity == null || (mentioned.length === 1 && fact.entity === mentioned[0])),
      );
      const suffix = clean.slice(match.index! + match[0].length).trimStart();
      const unitMismatch =
        (/^(?:%|percent\b)/i.test(suffix) && !fields.some((field) => /pct|percent/.test(field))) ||
        (/^(?:shares?\b)/i.test(suffix) && !fields.includes("quantity")) ||
        (/^(?:rupees?\b|INR\b)/i.test(suffix) &&
          fields.some((field) => /pct|percent|quantity|volume|rsi/.test(field)));
      const directionalMismatch =
        /\b(?:negative|down|fell|declined|loss)\b/i.test(prefix) &&
        fields.some((field) => /return|change/.test(field)) &&
        value > 0;
      if (
        unitMismatch ||
        directionalMismatch ||
        !supportedBy(
          value,
          eligible.map((fact) => fact.value),
        )
      )
        unsupported.push(value);
    }
  }
  return {
    figures_checked: checked,
    unsupported_figures: [...new Set(unsupported)],
    citations,
    unknown_citations: citations.filter((id) => !evidenceIds.includes(id)),
  };
}

export function groundingFooter(report: GroundingReport) {
  if (report.unsupported_figures.length || report.unknown_citations.length)
    return "I could not verify this answer against the cited evidence. Please ask about a specific available quote or account field.";
  return report.figures_checked
    ? `\n\n— Evidence check: all ${report.figures_checked} figure(s) match the cited fields.`
    : "\n\n— Evidence check: no figures to verify.";
}
