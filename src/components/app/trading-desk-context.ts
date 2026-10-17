import { createContext, useContext } from "react";

export type Side = "BUY" | "SELL";
export type Ticket = { symbol: string; price: number; side: Side };

export type TradingDeskValue = {
  openTicket: (ticket?: Partial<Ticket>) => void;
  openCommand: () => void;
};

export const TradingDeskContext = createContext<TradingDeskValue | null>(null);

export function useTradingDesk() {
  const value = useContext(TradingDeskContext);
  if (!value) throw new Error("useTradingDesk must be used inside TradingDeskProvider");
  return value;
}
