export const capabilities = [
  {
    index: "01",
    title: "MARKET DATA",
    body: "Real-time market information across major assets, normalised into a single schema.",
  },
  {
    index: "02",
    title: "QUANT SIGNALS",
    body: "Technical and quantitative indicators computed consistently across every instrument.",
  },
  {
    index: "03",
    title: "AI RESEARCH",
    body: "Natural-language market analysis grounded in the underlying data, with its reasoning shown.",
  },
  {
    index: "04",
    title: "PORTFOLIO INTELLIGENCE",
    body: "Understand exposure, risk and performance without assembling spreadsheets.",
  },
  {
    index: "05",
    title: "ALERTS",
    body: "Know when something meaningful changes — not every time a price ticks.",
  },
  {
    index: "06",
    title: "RESEARCH WORKSPACE",
    body: "Turn market data into structured, reviewable decisions you can revisit later.",
  },
];

export const coverage = [
  {
    label: "MARKET DATA",
    value: "Provider dependent",
    note: "Actual coverage and delays are shown in the local terminal.",
    status: "Connection required",
  },
  {
    label: "PAPER BOOK",
    value: "Delivery equities",
    note: "Virtual deposits, recorded fills and server-side checks.",
    status: "Local",
  },
  {
    label: "AI RESEARCH",
    value: "On request",
    note: "Research opinions are not validated forecast probabilities.",
    status: "Under evaluation",
  },
  {
    label: "OPTIONS AND REPLAY",
    value: "Unavailable",
    note: "Observed contracts and recorded sessions are required.",
    status: "Unavailable",
  },
];

export function toPath(points: number[], width: number, height: number, pad = 2) {
  const h = height - pad * 2;
  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = pad + (1 - p) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
