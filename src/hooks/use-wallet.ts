import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { practiceCall, selectPage, selectRows, workspaceRpc } from "@/lib/workspace-api";

export type WalletTxn = {
  id: string;
  kind: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
  order_id?: string | null;
  fill_id?: string | null;
  seq?: number;
};

/** Human wording for the database's simulated-trading error codes. */
export function tradingErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (raw.includes("SETTLEMENT_PENDING"))
    return "This amount is awaiting paper T+1 settlement or has unverified settlement history. Withdraw only the settled, unreserved cash shown in Wallet.";
  if (raw.includes("ORDER_VERSION_CONFLICT"))
    return "This order changed while you were editing it. Reopen the amendment using its latest version.";
  if (raw.includes("ORDER_AMEND_UNSUPPORTED"))
    return "Cancel this OCO pair and create a new pair to change its prices or quantity.";
  if (raw.includes("INSUFFICIENT_FUNDS")) return "Not enough wallet balance for this order.";
  if (raw.includes("INSUFFICIENT_QUANTITY")) return "You do not hold enough quantity to sell.";
  if (raw.includes("INVALID_AMOUNT")) return "Enter an amount greater than zero.";
  if (raw.includes("INVALID_QUANTITY")) return "Enter a quantity of at least one.";
  if (raw.includes("INVALID_PRICE")) return "Enter a valid price.";
  if (raw.includes("PRICE_CONDITION_NOT_MET"))
    return "The current market price has not reached this order's limit or stop trigger.";
  if (raw.includes("TRADING_PAUSED"))
    return "New paper exposure is paused. Validated sells of existing holdings are still allowed.";
  if (raw.includes("DAILY_LOSS_LIMIT"))
    return "Daily loss limit reached. New exposure is blocked; risk-reducing exits remain available.";
  if (raw.includes("ORDER_EXPIRED"))
    return "This DAY order has expired. Submit a new intent for a later session.";
  if (raw.includes("IDEMPOTENCY_CONFLICT"))
    return "This intent ID was already used with different order details.";
  if (raw.includes("LOCAL_STORE_BUSY"))
    return "Another process owns the local book. Retry after it finishes; see the recovery guide if a crashed process left a lock.";
  if (raw.includes("ORDER_VALUE_LIMIT"))
    return "This paper order exceeds your risk guardrail for order value.";
  if (raw.includes("NO_ACCOUNT")) return "Add funds to your wallet before trading.";
  if (raw.includes("ORDER_NOT_OPEN")) return "That order is no longer open.";
  if (raw.includes("ORDER_NOT_FOUND")) return "That order could not be found.";
  if (raw.includes("POSITION_VALUE_LIMIT"))
    return "This order would exceed your maximum position size guardrail.";
  if (raw.includes("NO_LIQUIDITY"))
    return "No observable liquidity at the quote; nothing was filled.";
  if (raw.includes("NO_EQUITY")) return "Your account has no equity for new exposure.";
  if (raw.includes("CHARGE_SCHEDULE_UNAVAILABLE"))
    return "No verified charge schedule covers this date; the order was not placed.";
  if (raw.includes("UNAUTHENTICATED")) return "Sign in again to continue.";
  return raw || "Something went wrong. Please try again.";
}

export function useWalletTransactions(limit = 40) {
  return useQuery({
    queryKey: ["wallet-transactions", limit],
    staleTime: 15_000,
    queryFn: async (): Promise<WalletTxn[]> => {
      return selectRows<WalletTxn>("wallet_transactions", {
        order: { field: "seq", ascending: false },
        limit,
      });
    },
  });
}

/** Complete paginated cash ledger, newest first. */
export function useWalletLedgerPage(page: number, pageSize: number, kind = "ALL") {
  return useQuery({
    queryKey: ["wallet-transactions", "page", page, pageSize, kind],
    staleTime: 15_000,
    queryFn: () =>
      selectPage<WalletTxn>("wallet_transactions", {
        filters: kind === "ALL" ? [] : [["kind", kind]],
        order: { field: "seq", ascending: false },
        limit: pageSize,
        offset: page * pageSize,
      }),
  });
}

/** Adds or removes simulated cash from the account wallet. */
export function useFundWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      amount,
      kind,
      intent_id,
    }: {
      amount: number;
      kind?: "DEPOSIT" | "WITHDRAW";
      intent_id?: string;
    }) => {
      await workspaceRpc("fund_wallet", {
        p_amount: amount,
        p_kind: kind ?? "DEPOSIT",
        p_intent_id: intent_id ?? crypto.randomUUID(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    },
  });
}

export type PracticeSummary = {
  account: {
    wallet_balance: number;
    total_funds: number;
    profit: number;
    charges_paid?: number;
  } | null;
  holdings: { symbol: string; quantity: number; avg_price: number }[];
};

/** The separate last-session practice book (never mixed with the main paper book). */
export function usePracticeBook() {
  return useQuery({
    queryKey: ["practice"],
    staleTime: 15_000,
    queryFn: async (): Promise<PracticeSummary> => {
      const [accounts, holdings] = await Promise.all([
        practiceCall<PracticeSummary["account"][]>({ table: "accounts", operation: "select" }),
        practiceCall<PracticeSummary["holdings"]>({ table: "holdings", operation: "select" }),
      ]);
      return { account: accounts[0] ?? null, holdings };
    },
  });
}

export function useFundPractice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount: number) =>
      practiceCall({
        rpc: "fund_wallet",
        values: { p_amount: amount, p_kind: "DEPOSIT", p_intent_id: crypto.randomUUID() },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["practice"] }),
  });
}
