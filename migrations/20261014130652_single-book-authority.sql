-- Watchlists, alerts, journal and preferences live inside the paper book state
-- (one authority, one atomic commit path), exactly as in the local book. The
-- separately writable tables created in 20261014130103 were empty and are removed
-- so no second copy of user-managed records can diverge.
DROP TABLE IF EXISTS public.watchlist_items, public.price_alerts, public.trade_journal,
  public.trading_preferences;
DROP FUNCTION IF EXISTS public.guard_owner_column();
