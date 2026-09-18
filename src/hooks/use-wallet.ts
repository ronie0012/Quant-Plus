import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WalletTxn = {
  id: string;
  kind: string;
  amount: number;
  balance_after: number;
  note: string | null;
  created_at: string;
};

/** Human wording for the database's simulated-trading error codes. */
export function tradingErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (raw.includes("INSUFFICIENT_FUNDS")) return "Not enough wallet balance for this order.";
  if (raw.includes("INSUFFICIENT_QUANTITY")) return "You do not hold enough quantity to sell.";
  if (raw.includes("INVALID_AMOUNT")) return "Enter an amount greater than zero.";
  if (raw.includes("INVALID_QUANTITY")) return "Enter a quantity of at least one.";
  if (raw.includes("INVALID_PRICE")) return "Enter a valid price.";
  if (raw.includes("NO_ACCOUNT")) return "Add funds to your wallet before trading.";
  if (raw.includes("ORDER_NOT_OPEN")) return "That order is no longer open.";
  if (raw.includes("ORDER_NOT_FOUND")) return "That order could not be found.";
  if (raw.includes("UNAUTHENTICATED")) return "Sign in again to continue.";
  return raw || "Something went wrong. Please try again.";
}

export function useWalletTransactions(limit = 40) {
  return useQuery({
    queryKey: ["wallet-transactions", limit],
    staleTime: 15_000,
    queryFn: async (): Promise<WalletTxn[]> => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id,kind,amount,balance_after,note,created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as WalletTxn[];
    },
  });
}

/** Adds or removes simulated cash from the account wallet. */
export function useFundWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ amount, kind }: { amount: number; kind?: "DEPOSIT" | "WITHDRAW" }) => {
      const { error } = await supabase.rpc("fund_wallet", {
        p_amount: amount,
        p_kind: kind ?? "DEPOSIT",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account"] });
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    },
  });
}
