import { applyRate, roundToRupee, type Paise } from "./money.ts";

/**
 * Versioned NSE cash-market delivery charge schedule. Statutory, exchange and
 * broker assumptions are kept separate so each can be revised independently.
 * Sources and hashes: audit/implementation/reference-data.json.
 */
export type ChargeItem = {
  code: "STT" | "EXCHANGE" | "SEBI" | "STAMP" | "GST" | "BROKERAGE" | "DP";
  label: string;
  category: "STATUTORY" | "EXCHANGE" | "REGULATOR" | "BROKER_ASSUMPTION";
  amount_paise: Paise;
  basis: string;
};

export type ChargeBreakdown = {
  schedule: string;
  items: ChargeItem[];
  total_paise: Paise;
};

type Schedule = {
  id: string;
  effective_from: string;
  stt_delivery_rate: number;
  exchange_rate: number;
  sebi_rate: number;
  stamp_delivery_buy_rate: number;
  gst_rate: number;
  brokerage_paise_per_order: Paise;
  dp_paise_per_sell: Paise;
  sources: string[];
};

export const CHARGE_SCHEDULES: Schedule[] = [
  {
    id: "nse-cm-delivery-2026-03-01",
    effective_from: "2026-03-01",
    // 0.1% on buy and sell for delivery equity (unchanged by the April 2026 F&O revision).
    stt_delivery_rate: 0.001,
    // Rs 306.99 transaction charge + Rs 0.01 IPFT per crore each side (NSE/FA/73061).
    exchange_rate: 307 / 1e7,
    // SEBI turnover fee Rs 10 per crore.
    sebi_rate: 10 / 1e7,
    // Stamp duty 0.015% on delivery purchases.
    stamp_delivery_buy_rate: 0.00015,
    gst_rate: 0.18,
    // Broker assumptions: zero-brokerage delivery and no DP charge unless configured.
    brokerage_paise_per_order: 0,
    dp_paise_per_sell: 0,
    sources: ["NSE/FA/73061", "Finance Act STT schedule", "Indian Stamp Act 2019 amendment"],
  },
];

export function chargeSchedule(atIso: string): Schedule | null {
  const day = atIso.slice(0, 10);
  return (
    [...CHARGE_SCHEDULES]
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
      .find((schedule) => schedule.effective_from <= day) ?? null
  );
}

/** Itemised charges for one delivery fill. Unknown dates fail closed. */
export function deliveryCharges(
  side: "BUY" | "SELL",
  turnover: Paise,
  atIso: string,
  firstFillOfOrder = true,
): ChargeBreakdown {
  const schedule = chargeSchedule(atIso);
  if (!schedule) throw new Error("CHARGE_SCHEDULE_UNAVAILABLE");
  const brokerage = firstFillOfOrder ? schedule.brokerage_paise_per_order : 0;
  const exchange = applyRate(turnover, schedule.exchange_rate);
  const sebi = applyRate(turnover, schedule.sebi_rate);
  const items: ChargeItem[] = [
    {
      code: "STT",
      label: "Securities transaction tax",
      category: "STATUTORY",
      // STT is rounded to the nearest rupee; this applies the rounding per fill.
      amount_paise: roundToRupee(applyRate(turnover, schedule.stt_delivery_rate)),
      basis: "0.1% of delivery turnover, rounded to the rupee per fill",
    },
    {
      code: "EXCHANGE",
      label: "Exchange transaction charge",
      category: "EXCHANGE",
      amount_paise: exchange,
      basis: "Rs 307 per crore each side",
    },
    {
      code: "SEBI",
      label: "SEBI turnover fee",
      category: "REGULATOR",
      amount_paise: sebi,
      basis: "Rs 10 per crore",
    },
  ];
  if (side === "BUY")
    items.push({
      code: "STAMP",
      label: "Stamp duty",
      category: "STATUTORY",
      amount_paise: applyRate(turnover, schedule.stamp_delivery_buy_rate),
      basis: "0.015% of delivery purchase value",
    });
  items.push({
    code: "BROKERAGE",
    label: "Brokerage",
    category: "BROKER_ASSUMPTION",
    amount_paise: brokerage,
    basis: "Assumed zero-brokerage delivery",
  });
  if (side === "SELL" && firstFillOfOrder)
    items.push({
      code: "DP",
      label: "Depository charge",
      category: "BROKER_ASSUMPTION",
      amount_paise: schedule.dp_paise_per_sell,
      basis: "Broker/depository assumption; not modelled unless configured",
    });
  items.push({
    code: "GST",
    label: "GST",
    category: "STATUTORY",
    amount_paise: applyRate(brokerage + exchange + sebi, schedule.gst_rate),
    basis: "18% of brokerage, exchange charge and SEBI fee",
  });
  return {
    schedule: schedule.id,
    items,
    total_paise: items.reduce((total, item) => total + item.amount_paise, 0),
  };
}
