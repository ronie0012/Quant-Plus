import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePriceAlerts, useTradingPreferences } from "@/hooks/use-trading-product";
import { useOrders } from "@/hooks/use-orders";
import { useHoldings } from "@/hooks/use-dashboard-data";
import { alertHit, bracketExit, simulatedPrice } from "@/lib/sim-price";

const DONE_KEY = "qp-bracket-done";
const PEAK_KEY = "qp-bracket-peaks";

function readJSON<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
}

function chime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch { /* audio unavailable */ }
}

/** Background watcher: fires price alerts and auto-exits bracket positions. */
export function TradingMonitor() {
  const client = useQueryClient();
  const { data: alerts } = usePriceAlerts();
  const { data: orders } = useOrders();
  const { data: holdings } = useHoldings();
  const { data: prefs } = useTradingPreferences();
  const busy = useRef(false);
  const state = useRef({ alerts, orders, holdings, prefs });
  state.current = { alerts, orders, holdings, prefs };

  useEffect(() => {
    const run = async () => {
      if (busy.current) return;
      busy.current = true;
      const { alerts, orders, holdings, prefs } = state.current;
      const now = Date.now();
      const sound = prefs?.notifications?.alerts !== false;
      try {
        for (const a of alerts ?? []) {
          if (!a.enabled || a.triggered_at) continue;
          const price = simulatedPrice(a.symbol, now);
          if (!alertHit(a.alert_type, a.threshold, price)) continue;
          const { error } = await supabase.from("price_alerts").update({ triggered_at: new Date().toISOString() }).eq("id", a.id);
          if (error) continue;
          toast(`Alert triggered · ${a.symbol}`, { description: `${a.alert_type === "PRICE_ABOVE" ? "Rose above" : "Fell below"} ₹${a.threshold} — simulated price ₹${price.toLocaleString("en-IN")}` });
          if (sound) chime();
          void client.invalidateQueries({ queryKey: ["price-alerts"] });
        }

        const done = new Set(readJSON<string[]>(DONE_KEY, []));
        const peaks = readJSON<Record<string, number>>(PEAK_KEY, {});
        for (const o of orders ?? []) {
          if (o.status !== "FILLED" || o.side !== "BUY" || done.has(o.id)) continue;
          if (o.stop_loss == null && o.target_price == null && o.trailing_stop == null) continue;
          const held = holdings?.find((h) => h.symbol === o.symbol);
          if (!held || held.quantity <= 0) { done.add(o.id); continue; }
          const price = simulatedPrice(o.symbol, now, o.price);
          peaks[o.id] = Math.max(peaks[o.id] ?? o.price, price);
          const reason = bracketExit(o, price, peaks[o.id]);
          if (!reason) continue;
          const qty = Math.min(o.quantity, Number(held.quantity));
          const { error } = await supabase.rpc("place_advanced_order", {
            p_symbol: o.symbol, p_company: o.company, p_side: "SELL", p_type: "MARKET", p_qty: qty, p_price: price, p_product: o.product, p_validity: "DAY",
          });
          done.add(o.id);
          if (error) { toast.error(`Bracket exit failed · ${o.symbol}`, { description: error.message }); continue; }
          const label = reason === "TARGET" ? "Target hit" : reason === "STOP" ? "Stop-loss hit" : "Trailing stop hit";
          toast.success(`${label} · sold ${qty} ${o.symbol}`, { description: `Auto-exited at simulated ₹${price.toLocaleString("en-IN")}` });
          if (sound) chime();
          for (const key of [["orders"], ["account"], ["holdings"], ["wallet-transactions"]]) void client.invalidateQueries({ queryKey: key });
        }
        localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
        localStorage.setItem(PEAK_KEY, JSON.stringify(peaks));
      } finally {
        busy.current = false;
      }
    };
    const id = window.setInterval(() => void run(), 5000);
    return () => window.clearInterval(id);
  }, [client]);

  return null;
}
