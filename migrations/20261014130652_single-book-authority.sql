-- Watchlists, alerts, journal and preferences live inside the paper book state
-- (one authority, one atomic commit path), exactly as in the local book. The
-- separately writable tables created in 20261014130103 were empty and are removed
-- so no second copy of user-managed records can diverge.
DO $$
DECLARE
  table_name text;
  row_count bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['watchlist_items', 'price_alerts', 'trade_journal', 'trading_preferences']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO row_count;
    IF row_count > 0 THEN
      RAISE EXCEPTION 'SINGLE_BOOK_MIGRATION_REQUIRES_EMPTY_TABLE: %', table_name;
    END IF;
  END LOOP;
END;
$$;
DROP TABLE IF EXISTS public.watchlist_items, public.price_alerts, public.trade_journal,
  public.trading_preferences;
DROP FUNCTION IF EXISTS public.guard_owner_column();
