import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useManageOrder, type Order } from "@/hooks/use-orders";
import type { Holding } from "@/hooks/use-dashboard-data";
import { tradingErrorMessage } from "@/hooks/use-wallet";

export type OrderManagementSelection =
  { kind: "amend"; order: Order } | { kind: "oco"; holding: Holding };

export function OrderManagementDialog({
  selection,
  onClose,
}: {
  selection: OrderManagementSelection;
  onClose: () => void;
}) {
  const amend = selection.kind === "amend";
  const symbol = amend ? selection.order.symbol : selection.holding.symbol;
  const [quantity, setQuantity] = useState(
    String(
      amend
        ? selection.order.quantity
        : (selection.holding.available_quantity ?? selection.holding.quantity),
    ),
  );
  const [price, setPrice] = useState(amend ? String(selection.order.limit_price ?? "") : "");
  const [target, setTarget] = useState("");
  const [intent, setIntent] = useState(() => crypto.randomUUID());
  const mutation = useManageOrder();
  const change = (setter: (value: string) => void, value: string) => {
    setter(value);
    setIntent(crypto.randomUUID());
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        path: amend ? `orders/${selection.order.id}/amend` : "orders/oco",
        body: amend
          ? {
              intent_id: intent,
              quantity: Number(quantity),
              limit_price: Number(price),
              expected_version: selection.order.version,
            }
          : {
              intent_id: intent,
              symbol,
              company: selection.holding.company,
              quantity: Number(quantity),
              stop_price: Number(price),
              target_price: Number(target),
            },
      });
      toast.success(amend ? "Order amended" : "OCO exit orders created");
      onClose();
    } catch (error) {
      toast.error(tradingErrorMessage(error));
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {amend ? "Amend order" : "Create OCO exit"} · {symbol}
          </DialogTitle>
          <DialogDescription>
            {amend
              ? "Change the total quantity and resting price. A marketable amendment can fill immediately. The server rechecks funds, holdings and risk limits."
              : "Create two DAY sell orders for existing holdings: a stop below the current price and a target above it. They reserve shares once. The first fill, including a partial fill, cancels the other leg. Cancelling either leg cancels the pair."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <fieldset disabled={mutation.isPending} className="space-y-4">
            <label className="block text-sm">
              {amend ? "Total order quantity" : "Shares to protect"}
              <Input
                className="mt-2"
                type="number"
                min={amend ? selection.order.filled_quantity + 1 : 1}
                step={1}
                max={
                  amend
                    ? undefined
                    : (selection.holding.available_quantity ?? selection.holding.quantity)
                }
                required
                value={quantity}
                onChange={(event) => change(setQuantity, event.target.value)}
              />
            </label>
            <label className="block text-sm">
              {amend ? "Limit or trigger price (₹)" : "Stop trigger (₹)"}
              <Input
                className="mt-2"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={price}
                onChange={(event) => change(setPrice, event.target.value)}
              />
            </label>
            {!amend && (
              <label className="block text-sm">
                Target limit (₹)
                <Input
                  className="mt-2"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={target}
                  onChange={(event) => change(setTarget, event.target.value)}
                />
              </label>
            )}
            <p className="text-xs text-subtle">
              Paper trading only. Execution uses a fresh server-verified quote during an open market
              session.
            </p>
            <Button type="submit" className="w-full">
              {mutation.isPending
                ? "Submitting…"
                : amend
                  ? "Submit amendment"
                  : "Create OCO exit orders"}
            </Button>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
