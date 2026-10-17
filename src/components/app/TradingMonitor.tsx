import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTradingPreferences } from "@/hooks/use-trading-product";
import { useSession } from "@/hooks/use-session";
import { workspaceRpc } from "@/lib/workspace-api";
import { AttentionBudget } from "@/lib/quant/attention";

/** System notification through the service worker when available. */
function systemNotify(title: string, body: string | undefined) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const options = { body: body ?? "", icon: "/icon.svg", data: { url: "/app/alerts" } };
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration) void registration.showNotification(title, options);
        else new Notification(title, options);
      });
    else new Notification(title, options);
  } catch {
    /* notifications unavailable */
  }
}

const SEEN_KEY = "qp-notification-seq";
const POLL_MS = 5000;

type BookEvent = {
  seq: number;
  type: string;
  at: string;
  data: Record<string, unknown>;
};

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
  } catch {
    /* audio unavailable */
  }
}

const inr = (value: unknown) =>
  typeof value === "number" ? `₹${(value / 100).toLocaleString("en-IN")}` : "an observed price";

function describe(
  event: BookEvent,
): { title: string; description: string; kind: "order" | "alert" | "error" } | null {
  const d = event.data;
  switch (event.type) {
    case "ORDER_FILLED":
    case "ORDER_PARTIALLY_FILLED":
      return {
        kind: "order",
        title: `${event.type === "ORDER_FILLED" ? "Filled" : "Partially filled"} · ${String(d["side"])} ${String(d["quantity"])} ${String(d["symbol"])}`,
        description: `Paper fill at ${inr(d["price_paise"])} (${String(d["method"]).replaceAll("_", " ").toLowerCase()}); charges ${inr(d["charges_paise"])}.`,
      };
    case "ORDER_EXPIRED":
      return {
        kind: "order",
        title: "DAY order expired",
        description: "The session closed before the order filled; its reservation was released.",
      };
    case "ORDER_REJECTED_AT_FILL":
      return {
        kind: "error",
        title: "Resting order rejected",
        description: `Fill-time check failed: ${String(d["reason"])}. Its reservation was released.`,
      };
    case "ORDER_REMAINDER_CANCELLED":
      return {
        kind: "order",
        title: "Market remainder cancelled",
        description: `Only ${String(d["filled_quantity"])} could fill against observed liquidity.`,
      };
    case "PROTECTION_TRIGGERED":
      return {
        kind: "order",
        title: `${d["reason"] === "TARGET" ? "Target hit" : d["reason"] === "STOP" ? "Stop-loss hit" : "Trailing stop hit"}`,
        description: `Server exit sold ${String(d["exit_quantity"])} at trigger ${inr(d["trigger_price_paise"])}.`,
      };
    case "PROTECTION_EXIT_FAILED":
      return {
        kind: "error",
        title: "Protective exit failed",
        description: `The server will retry: ${String(d["error"])}.`,
      };
    case "PROTECTION_CLOSED":
      return {
        kind: "order",
        title: "Protection closed",
        description: "No remaining holding to protect.",
      };
    case "ALERT_TRIGGERED":
      return {
        kind: "alert",
        title: `Alert triggered · ${String(d["symbol"])}`,
        description: `${String(d["alert_type"]).replaceAll("_", " ").toLowerCase()} ${String(d["threshold"])} — observed ₹${Number(d["price"]).toLocaleString("en-IN")}`,
      };
    default:
      return null;
  }
}

/**
 * Displays notifications for work the server-side paper worker performed.
 * Execution, alerts and protections are owned by the server; closing this
 * tab does not stop them, and multiple tabs cannot double-execute.
 */
export function TradingMonitor() {
  const client = useQueryClient();
  const { session } = useSession();
  const { data: prefs } = useTradingPreferences();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const budgetRef = useRef(new AttentionBudget(12));
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const key = `${SEEN_KEY}:${userId}`;
    let seen: number | null = null;
    try {
      const stored = Number(sessionStorage.getItem(key));
      seen = Number.isFinite(stored) && stored > 0 ? stored : null;
    } catch {
      seen = null;
    }
    let busy = false;
    const poll = async () => {
      const push = prefsRef.current?.workspace?.push_notifications === true;
      // Hidden tabs keep polling only when the user turned on system notifications.
      if (busy || (document.visibilityState === "hidden" && !push)) return;
      busy = true;
      try {
        const result = await workspaceRpc<{ latest_seq: number; events: BookEvent[] }>(
          "notifications",
          { p_after_seq: seen ?? 0 },
        );
        // The first poll in a tab establishes a baseline instead of replaying history.
        if (seen != null) {
          const notifications = prefsRef.current?.notifications ?? {};
          budgetRef.current.setBudget(prefsRef.current?.workspace?.attention_budget_per_hour ?? 12);
          let changedBook = false;
          for (const event of result.events) {
            const message = describe(event);
            if (!message) continue;
            changedBook ||= message.kind !== "alert";
            const enabled =
              message.kind === "alert"
                ? notifications["alerts"] !== false
                : notifications["orders"] !== false;
            if (!enabled) continue;
            // Errors always interrupt; everything else counts against the attention budget.
            if (!budgetRef.current.allow(Date.now(), message.kind === "error")) continue;
            (message.kind === "error" ? toast.error : toast)(message.title, {
              description: message.description,
            });
            if (document.visibilityState === "hidden" && push)
              systemNotify(message.title, message.description);
            if (message.kind === "alert") chime();
          }
          const held = budgetRef.current.takeHeld();
          if (held > 0)
            toast(`${held} notification${held === 1 ? "" : "s"} held by your attention budget`, {
              description: "Review them on the Orders and Alerts pages.",
            });
          if (result.events.length) {
            void client.invalidateQueries({ queryKey: ["price-alerts"] });
            void client.invalidateQueries({ queryKey: ["alert-events"] });
            if (changedBook)
              for (const query of [
                ["orders"],
                ["account"],
                ["holdings"],
                ["wallet-transactions"],
                ["protections"],
                ["risk-status"],
              ])
                void client.invalidateQueries({ queryKey: query });
          }
        }
        seen = result.latest_seq;
        try {
          sessionStorage.setItem(key, String(seen));
        } catch {
          /* storage unavailable */
        }
      } catch {
        /* The next poll retries; execution does not depend on this tab. */
      } finally {
        busy = false;
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [client, userId]);

  return null;
}
