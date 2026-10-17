-- Quant Plus hosted paper book (InsForge). Additive; backout SQL: audit/implementation/insforge/rollback-20261014130103.sql
--
-- Authority model: the Node paper-book service is the single writer. It runs the
-- same engine as the local book and commits each atomic change with
-- public.paper_commit_book(), a compare-and-swap on the book version that also
-- appends ledger/fill/event rows. Browsers may READ their own book rows and
-- manage only their own watchlist, alerts, journal and preferences.
-- Money is integer paise (bigint); quantities are whole shares.

-- ------------------------------------------------------------------ book
CREATE TABLE public.paper_books (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version bigint NOT NULL CHECK (version > 0),
  state jsonb NOT NULL,
  state_sha256 text NOT NULL CHECK (state_sha256 ~ '^[0-9a-f]{64}$'),
  cash_paise bigint NOT NULL CHECK (cash_paise >= 0),
  seq bigint NOT NULL CHECK (seq >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.paper_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent_id text NOT NULL CHECK (intent_id ~ '^[A-Za-z0-9:_-]{8,160}$'),
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9][A-Z0-9&-]{0,29}$'),
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  order_type text NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT', 'STOP')),
  quantity integer NOT NULL CHECK (quantity > 0),
  filled_quantity integer NOT NULL CHECK (filled_quantity >= 0),
  limit_price_paise bigint CHECK (limit_price_paise > 0),
  avg_fill_paise bigint CHECK (avg_fill_paise > 0),
  charges_paise bigint NOT NULL CHECK (charges_paise >= 0),
  status text NOT NULL CHECK (status IN ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED', 'REJECTED')),
  status_reason text,
  execution_mode text NOT NULL CHECK (execution_mode IN ('LIVE', 'LAST_SESSION_PRACTICE')),
  parent_order_id uuid,
  expires_at timestamptz,
  version integer NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (filled_quantity <= quantity),
  UNIQUE (user_id, intent_id)
);
CREATE INDEX paper_orders_user_created ON public.paper_orders (user_id, created_at DESC);
CREATE INDEX paper_orders_user_status ON public.paper_orders (user_id, status);

CREATE TABLE public.paper_fills (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.paper_orders(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity integer NOT NULL CHECK (quantity > 0),
  price_paise bigint NOT NULL CHECK (price_paise > 0),
  reference_price_paise bigint NOT NULL CHECK (reference_price_paise > 0),
  method text NOT NULL,
  charges jsonb,
  charges_paise bigint NOT NULL CHECK (charges_paise >= 0),
  quote jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, seq)
);
CREATE INDEX paper_fills_order ON public.paper_fills (order_id);

CREATE TABLE public.paper_ledger (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('DEPOSIT', 'WITHDRAW', 'BUY', 'SELL', 'CHARGES', 'MIGRATION_ADJUSTMENT')),
  amount_paise bigint NOT NULL,
  balance_after_paise bigint NOT NULL CHECK (balance_after_paise >= 0),
  order_id uuid,
  fill_id uuid,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL,
  UNIQUE (user_id, seq)
);

CREATE TABLE public.paper_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  type text NOT NULL,
  entity text NOT NULL,
  entity_id text NOT NULL,
  notify boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL,
  PRIMARY KEY (user_id, seq)
);

CREATE TABLE public.paper_intents (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent_id text NOT NULL,
  fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, intent_id)
);

-- Append-only history: no direct updates or deletes (account deletion cascades are allowed).
CREATE OR REPLACE FUNCTION public.paper_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'APPEND_ONLY: % rows cannot be %d', TG_TABLE_NAME, lower(TG_OP);
END;
$$;
CREATE TRIGGER paper_ledger_append_only BEFORE UPDATE OR DELETE ON public.paper_ledger
  FOR EACH ROW EXECUTE FUNCTION public.paper_append_only();
CREATE TRIGGER paper_events_append_only BEFORE UPDATE OR DELETE ON public.paper_events
  FOR EACH ROW EXECUTE FUNCTION public.paper_append_only();
CREATE TRIGGER paper_fills_append_only BEFORE UPDATE OR DELETE ON public.paper_fills
  FOR EACH ROW EXECUTE FUNCTION public.paper_append_only();

-- ------------------------------------------------------------------ atomic commit
CREATE OR REPLACE FUNCTION public.paper_commit_book(
  p_user_id uuid,
  p_expected_version bigint,
  p_state jsonb,
  p_state_sha256 text,
  p_orders jsonb,
  p_fills jsonb,
  p_ledger jsonb,
  p_events jsonb,
  p_intents jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_cash bigint := (p_state #>> '{account,cash_paise}')::bigint;
  v_seq bigint := (p_state ->> 'seq')::bigint;
  v_version bigint;
  v_ledger_cash bigint;
  v_last_balance bigint;
BEGIN
  IF p_user_id IS NULL OR v_cash IS NULL OR v_seq IS NULL THEN
    RAISE EXCEPTION 'BOOK_INVALID';
  END IF;
  IF (p_state #>> '{account,user_id}')::uuid IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'BOOK_OWNER_MISMATCH';
  END IF;

  -- Compare-and-swap: concurrent writers cannot both commit from one version.
  IF p_expected_version = 0 THEN
    INSERT INTO public.paper_books (user_id, version, state, state_sha256, cash_paise, seq)
    VALUES (p_user_id, 1, p_state, p_state_sha256, v_cash, v_seq)
    ON CONFLICT (user_id) DO NOTHING;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'BOOK_VERSION_CONFLICT';
    END IF;
    v_version := 1;
  ELSE
    UPDATE public.paper_books
       SET version = version + 1, state = p_state, state_sha256 = p_state_sha256,
           cash_paise = v_cash, seq = v_seq, updated_at = now()
     WHERE user_id = p_user_id AND version = p_expected_version AND seq <= v_seq
    RETURNING version INTO v_version;
    IF v_version IS NULL THEN
      RAISE EXCEPTION 'BOOK_VERSION_CONFLICT';
    END IF;
  END IF;

  INSERT INTO public.paper_orders AS o (id, user_id, intent_id, symbol, side, order_type, quantity,
      filled_quantity, limit_price_paise, avg_fill_paise, charges_paise, status, status_reason,
      execution_mode, parent_order_id, expires_at, version, created_at, updated_at)
  SELECT r.id, p_user_id, r.intent_id, r.symbol, r.side, r.order_type, r.quantity, r.filled_quantity,
         r.limit_price_paise, r.avg_fill_paise, r.charges_paise, r.status, r.status_reason,
         r.execution_mode, r.parent_order_id, r.expires_at, r.version, r.created_at, r.updated_at
    FROM jsonb_to_recordset(coalesce(p_orders, '[]'::jsonb)) AS r(
      id uuid, intent_id text, symbol text, side text, order_type text, quantity integer,
      filled_quantity integer, limit_price_paise bigint, avg_fill_paise bigint, charges_paise bigint,
      status text, status_reason text, execution_mode text, parent_order_id uuid,
      expires_at timestamptz, version integer, created_at timestamptz, updated_at timestamptz)
  ON CONFLICT (id) DO UPDATE
     SET filled_quantity = excluded.filled_quantity, avg_fill_paise = excluded.avg_fill_paise,
         charges_paise = excluded.charges_paise, status = excluded.status,
         status_reason = excluded.status_reason, version = excluded.version,
         updated_at = excluded.updated_at
   WHERE o.user_id = p_user_id AND excluded.version >= o.version;

  INSERT INTO public.paper_fills (id, user_id, order_id, seq, symbol, side, quantity, price_paise,
      reference_price_paise, method, charges, charges_paise, quote, created_at)
  SELECT r.id, p_user_id, r.order_id, r.seq, r.symbol, r.side, r.quantity, r.price_paise,
         r.reference_price_paise, r.method, r.charges, coalesce((r.charges ->> 'total_paise')::bigint, 0),
         r.quote, r.created_at
    FROM jsonb_to_recordset(coalesce(p_fills, '[]'::jsonb)) AS r(
      id uuid, order_id uuid, seq bigint, symbol text, side text, quantity integer, price_paise bigint,
      reference_price_paise bigint, method text, charges jsonb, quote jsonb, created_at timestamptz);

  INSERT INTO public.paper_ledger (id, user_id, seq, kind, amount_paise, balance_after_paise,
      order_id, fill_id, note, created_at)
  SELECT r.id, p_user_id, r.seq, r.kind, r.amount_paise, r.balance_after_paise, r.order_id,
         r.fill_id, coalesce(r.note, ''), r.created_at
    FROM jsonb_to_recordset(coalesce(p_ledger, '[]'::jsonb)) AS r(
      id uuid, seq bigint, kind text, amount_paise bigint, balance_after_paise bigint,
      order_id uuid, fill_id uuid, note text, created_at timestamptz);

  INSERT INTO public.paper_events (user_id, seq, type, entity, entity_id, notify, data, at)
  SELECT p_user_id, r.seq, r.type, r.entity, r.entity_id, coalesce(r.notify, false),
         coalesce(r.data, '{}'::jsonb), r.at
    FROM jsonb_to_recordset(coalesce(p_events, '[]'::jsonb)) AS r(
      seq bigint, type text, entity text, entity_id text, notify boolean, data jsonb, at timestamptz);

  -- A reused intent must have been replayed by the service; a second insert is a bug.
  INSERT INTO public.paper_intents (user_id, intent_id, fingerprint)
  SELECT p_user_id, r.intent_id, r.fingerprint
    FROM jsonb_to_recordset(coalesce(p_intents, '[]'::jsonb)) AS r(intent_id text, fingerprint text);

  -- The relational ledger must reconcile exactly with the committed book state.
  SELECT coalesce(sum(amount_paise), 0) INTO v_ledger_cash FROM public.paper_ledger WHERE user_id = p_user_id;
  SELECT balance_after_paise INTO v_last_balance FROM public.paper_ledger
   WHERE user_id = p_user_id ORDER BY seq DESC LIMIT 1;
  IF v_ledger_cash <> v_cash OR (v_last_balance IS NOT NULL AND v_last_balance <> v_cash) THEN
    RAISE EXCEPTION 'BOOK_RECONCILIATION_FAILED';
  END IF;
  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.paper_commit_book(uuid, bigint, jsonb, text, jsonb, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.paper_append_only() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ user-managed tables
CREATE TABLE public.watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9][A-Z0-9&-]{0,29}$'),
  company text NOT NULL DEFAULT '' CHECK (length(company) <= 200),
  sector text CHECK (length(sector) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

CREATE TABLE public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9][A-Z0-9&-]{0,29}$'),
  alert_type text NOT NULL CHECK (alert_type IN ('PRICE_ABOVE', 'PRICE_BELOW', 'MOVE_PERCENT')),
  threshold numeric NOT NULL CHECK (threshold > 0),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 10000),
  enabled boolean NOT NULL DEFAULT true,
  triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.trade_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid,
  symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9][A-Z0-9&-]{0,29}$'),
  thesis text NOT NULL DEFAULT '' CHECK (length(thesis) <= 10000),
  evidence text[] NOT NULL DEFAULT '{}' CHECK (cardinality(evidence) <= 200),
  risks text[] NOT NULL DEFAULT '{}' CHECK (cardinality(risks) <= 200),
  invalidation text NOT NULL DEFAULT '' CHECK (length(invalidation) <= 10000),
  planned_exit text NOT NULL DEFAULT '' CHECK (length(planned_exit) <= 10000),
  reflection text NOT NULL DEFAULT '' CHECK (length(reflection) <= 10000),
  outcome text NOT NULL DEFAULT 'OPEN' CHECK (outcome IN ('OPEN', 'WIN', 'LOSS', 'FLAT', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.trading_preferences (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  density text NOT NULL DEFAULT 'COMFORTABLE' CHECK (density IN ('COMFORTABLE', 'COMPACT')),
  calm_mode boolean NOT NULL DEFAULT false,
  default_order_type text NOT NULL DEFAULT 'MARKET' CHECK (default_order_type IN ('MARKET', 'LIMIT', 'STOP')),
  default_product text NOT NULL DEFAULT 'DELIVERY' CHECK (default_product = 'DELIVERY'),
  default_quantity integer NOT NULL DEFAULT 10 CHECK (default_quantity > 0),
  chart_type text NOT NULL DEFAULT 'CANDLE' CHECK (chart_type IN ('CANDLE', 'LINE', 'AREA')),
  show_volume boolean NOT NULL DEFAULT true,
  notifications jsonb NOT NULL DEFAULT '{"orders": true, "alerts": true, "news": false}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX price_alerts_user ON public.price_alerts (user_id);
CREATE INDEX trade_journal_user_created ON public.trade_journal (user_id, created_at DESC);

-- Ownership is assigned by the database and can never be changed by a caller.
CREATE OR REPLACE FUNCTION public.guard_owner_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() AND current_user IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'INVALID_OWNER';
    END IF;
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'INVALID_OWNER';
  END IF;
  -- Browsers may re-arm an alert (clear triggered_at) but never mark it triggered.
  IF TG_TABLE_NAME = 'price_alerts' AND current_user IN ('anon', 'authenticated')
     AND NEW.triggered_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.triggered_at IS DISTINCT FROM OLD.triggered_at) THEN
    RAISE EXCEPTION 'ALERT_TRIGGER_IS_SERVER_OWNED';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER watchlist_items_owner BEFORE INSERT OR UPDATE ON public.watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_column();
CREATE TRIGGER price_alerts_owner BEFORE INSERT OR UPDATE ON public.price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_column();
CREATE TRIGGER trade_journal_owner BEFORE INSERT OR UPDATE ON public.trade_journal
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_column();
CREATE TRIGGER trading_preferences_owner BEFORE INSERT OR UPDATE ON public.trading_preferences
  FOR EACH ROW EXECUTE FUNCTION public.guard_owner_column();

-- ------------------------------------------------------------------ privileges and RLS
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['paper_books', 'paper_orders', 'paper_fills', 'paper_ledger',
                           'paper_events', 'paper_intents', 'watchlist_items', 'price_alerts',
                           'trade_journal', 'trading_preferences']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()))',
                   t || '_owner_read', t);
  END LOOP;
  -- The book itself is readable by its owner; all book writes go through paper_commit_book.
  FOREACH t IN ARRAY ARRAY['paper_books', 'paper_orders', 'paper_fills', 'paper_ledger', 'paper_events']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['watchlist_items', 'price_alerts', 'trade_journal', 'trading_preferences']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()))',
                   t || '_owner_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))',
                   t || '_owner_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()))',
                   t || '_owner_delete', t);
  END LOOP;
END;
$$;
-- Ledger-like book tables are never written directly by runtime roles.
REVOKE ALL ON FUNCTION public.guard_owner_column() FROM PUBLIC, anon, authenticated;
