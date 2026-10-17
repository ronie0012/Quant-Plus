-- Local regression checks for
-- 20261013120000_server_authoritative_paper_orders.sql.
--
-- Run after the local schema has been reset and migrations have been applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/20261013120000_server_authoritative_paper_orders.sql
--
-- Everything, including the auth fixture and trigger side effects, is rolled
-- back at the end. No private credentials or remote database are required.

\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000071',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'server-order-sql-test@example.invalid', '',
  '{}'::jsonb, '{}'::jsonb, now(), now()
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.reset_paper_fixture(
  p_wallet numeric,
  p_funds_used numeric,
  p_profit numeric,
  p_max_position_pct numeric,
  p_max_order_value numeric,
  p_trading_paused boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.orders
  WHERE user_id = '00000000-0000-0000-0000-000000000071';
  DELETE FROM public.wallet_transactions
  WHERE user_id = '00000000-0000-0000-0000-000000000071';
  DELETE FROM public.holdings
  WHERE user_id = '00000000-0000-0000-0000-000000000071';
  DELETE FROM public.risk_limits
  WHERE user_id = '00000000-0000-0000-0000-000000000071';

  INSERT INTO public.accounts (
    user_id, total_funds, funds_used, profit, profit_pct,
    wallet_balance, onboarded
  ) VALUES (
    '00000000-0000-0000-0000-000000000071',
    p_wallet + p_funds_used, p_funds_used, p_profit, 0, p_wallet, true
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_funds = EXCLUDED.total_funds,
    funds_used = EXCLUDED.funds_used,
    profit = EXCLUDED.profit,
    profit_pct = EXCLUDED.profit_pct,
    wallet_balance = EXCLUDED.wallet_balance,
    onboarded = EXCLUDED.onboarded;

  INSERT INTO public.risk_limits (
    user_id, daily_loss_limit, max_order_value, max_position_pct,
    confirmation_above, trading_paused
  ) VALUES (
    '00000000-0000-0000-0000-000000000071',
    50000, p_max_order_value, p_max_position_pct, 500000, p_trading_paused
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_paper_error(
  p_expected text,
  p_sql text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_ignored record;
  v_actual text;
BEGIN
  BEGIN
    EXECUTE p_sql INTO v_ignored;
    RAISE EXCEPTION 'NO_ERROR';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_actual = MESSAGE_TEXT;
    IF v_actual <> p_expected THEN
      RAISE EXCEPTION 'expected %, got %', p_expected, v_actual;
    END IF;
  END;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.place_server_advanced_order(uuid,text,text,public.order_side,public.order_kind,numeric,numeric,numeric,text,text,numeric,numeric,numeric)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can execute the server placement function';
  END IF;
  IF NOT has_function_privilege(
    'service_role',
    'public.place_server_advanced_order(uuid,text,text,public.order_side,public.order_kind,numeric,numeric,numeric,text,text,numeric,numeric,numeric)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role cannot execute the server placement function';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.fill_open_order(uuid,numeric)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can execute the old price-selected fill function';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'public.modify_open_order(uuid,integer,numeric,numeric,numeric)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can execute the old modify function';
  END IF;
  IF has_function_privilege(
    'service_role',
    'public._server_order_risk_check(uuid,text,public.order_side,numeric,numeric)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'service_role can execute the private risk helper directly';
  END IF;
END;
$$;

SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 1000, false);

SELECT pg_temp.assert_paper_error(
  'INVALID_SYMBOL',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE.NS', 'Reliance',
      'BUY'::public.order_side, 'LIMIT'::public.order_kind,
      1, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

SELECT pg_temp.assert_paper_error(
  'INVALID_QUANTITY',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'BUY'::public.order_side, 'LIMIT'::public.order_kind,
      1.5, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

SELECT pg_temp.assert_paper_error(
  'INVALID_QUANTITY',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'BUY'::public.order_side, 'LIMIT'::public.order_kind,
      2147483648, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

SELECT pg_temp.assert_paper_error(
  'INVALID_PRODUCT',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'BUY'::public.order_side, 'LIMIT'::public.order_kind,
      1, 100, 100, 'INTRADAY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

SELECT pg_temp.assert_paper_error(
  'INVALID_VALIDITY',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'BUY'::public.order_side, 'LIMIT'::public.order_kind,
      1, 100, 100, 'DELIVERY', 'IOC', NULL, NULL, NULL
    )
  $op$
);

SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 1000, true);
SELECT pg_temp.assert_paper_error(
  'TRADING_PAUSED',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'BUY'::public.order_side, 'LIMIT'::public.order_kind,
      1, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 100, false);
SELECT pg_temp.assert_paper_error(
  'ORDER_VALUE_LIMIT',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'BUY'::public.order_side, 'LIMIT'::public.order_kind,
      2, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

-- A buy with no equity must not bypass the position check.
SELECT pg_temp.reset_paper_fixture(0, 0, 0, 25, 1000, false);
SELECT pg_temp.assert_paper_error(
  'NO_EQUITY',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'BUY'::public.order_side, 'LIMIT'::public.order_kind,
      1, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

-- Realized profit is already in wallet_balance; adding profit would wrongly
-- raise the position cap from 500 to 950 for this fixture.
SELECT pg_temp.reset_paper_fixture(1000, 0, 900, 50, 1000, false);
SELECT pg_temp.assert_paper_error(
  'POSITION_VALUE_LIMIT',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'BUY'::public.order_side, 'MARKET'::public.order_kind,
      6, 100, NULL, 'DELIVERY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

-- Creation passes with no existing position, but the same cost-basis check
-- must reject the resting fill after another position appears.
SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 50, 1000, false);
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT id INTO v_order_id
  FROM public.place_server_advanced_order(
    '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
    'BUY'::public.order_side, 'LIMIT'::public.order_kind,
    4, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
  );
  INSERT INTO public.holdings (user_id, symbol, company, quantity, avg_price, last_price)
  VALUES ('00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance', 2, 100, 100);
  PERFORM pg_temp.assert_paper_error(
    'POSITION_VALUE_LIMIT',
    format(
      'SELECT public.fill_server_open_order(%L, %L, 100)',
      '00000000-0000-0000-0000-000000000071', v_order_id
    )
  );
END;
$$;

DO $$
DECLARE
  v_status public.order_status;
  v_quantity numeric;
BEGIN
  SELECT status, filled_quantity INTO v_status, v_quantity
  FROM public.orders
  WHERE user_id = '00000000-0000-0000-0000-000000000071';
  IF v_status <> 'OPEN' OR v_quantity <> 0 THEN
    RAISE EXCEPTION 'failed fill changed the order';
  END IF;
  SELECT quantity INTO v_quantity
  FROM public.holdings
  WHERE user_id = '00000000-0000-0000-0000-000000000071' AND symbol = 'RELIANCE';
  IF v_quantity <> 2 THEN RAISE EXCEPTION 'failed fill changed the holding'; END IF;
END;
$$;

-- Trading pause is also rechecked at the resting-fill boundary.
SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 1000, false);
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO public.holdings (user_id, symbol, company, quantity, avg_price, last_price)
  VALUES ('00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance', 1, 100, 100);
  SELECT id INTO v_order_id
  FROM public.place_server_advanced_order(
    '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
    'SELL'::public.order_side, 'LIMIT'::public.order_kind,
    1, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
  );
  UPDATE public.risk_limits
  SET trading_paused = true
  WHERE user_id = '00000000-0000-0000-0000-000000000071';
  PERFORM pg_temp.assert_paper_error(
    'TRADING_PAUSED',
    format(
      'SELECT public.fill_server_open_order(%L, %L, 100)',
      '00000000-0000-0000-0000-000000000071', v_order_id
    )
  );
END;
$$;

-- The execution price is authoritative for the fill notional.
SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 1000, false);
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO public.holdings (user_id, symbol, company, quantity, avg_price, last_price)
  VALUES ('00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance', 4, 100, 100);
  SELECT id INTO v_order_id
  FROM public.place_server_advanced_order(
    '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
    'SELL'::public.order_side, 'LIMIT'::public.order_kind,
    4, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
  );
  PERFORM pg_temp.assert_paper_error(
    'ORDER_VALUE_LIMIT',
    format(
      'SELECT public.fill_server_open_order(%L, %L, 300)',
      '00000000-0000-0000-0000-000000000071', v_order_id
    )
  );
END;
$$;

-- A missing risk row must reject a fill rather than treating NULL limits as
-- permissive values.
SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 1000, false);
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  INSERT INTO public.holdings (user_id, symbol, company, quantity, avg_price, last_price)
  VALUES ('00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance', 1, 100, 100);
  SELECT id INTO v_order_id
  FROM public.place_server_advanced_order(
    '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
    'SELL'::public.order_side, 'LIMIT'::public.order_kind,
    1, 100, 100, 'DELIVERY', 'DAY', NULL, NULL, NULL
  );
  DELETE FROM public.risk_limits
  WHERE user_id = '00000000-0000-0000-0000-000000000071';
  PERFORM pg_temp.assert_paper_error(
    'RISK_LIMITS_MISSING',
    format(
      'SELECT public.fill_server_open_order(%L, %L, 100)',
      '00000000-0000-0000-0000-000000000071', v_order_id
    )
  );
END;
$$;

-- Model modify_open_order having stored an invalid protection value; fill
-- validation must catch it before settlement.
SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 1000, false);
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT id INTO v_order_id
  FROM public.place_server_advanced_order(
    '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
    'BUY'::public.order_side, 'LIMIT'::public.order_kind,
    1, 100, 100, 'DELIVERY', 'DAY', 90, 110, NULL
  );
  UPDATE public.orders
  SET stop_loss = 100
  WHERE id = v_order_id;
  PERFORM pg_temp.assert_paper_error(
    'INVALID_STOP_LOSS',
    format(
      'SELECT public.fill_server_open_order(%L, %L, 100)',
      '00000000-0000-0000-0000-000000000071', v_order_id
    )
  );
END;
$$;

-- Successful settlement remains atomic with the order write.
SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 1000, false);
DO $$
DECLARE
  v_status public.order_status;
  v_symbol text;
  v_wallet numeric;
  v_quantity numeric;
BEGIN
  SELECT status, symbol INTO v_status, v_symbol
  FROM public.place_server_advanced_order(
    '00000000-0000-0000-0000-000000000071', 'reliance', 'Reliance',
    'BUY'::public.order_side, 'MARKET'::public.order_kind,
    1, 100, NULL, 'DELIVERY', 'DAY', NULL, NULL, NULL
  );
  SELECT wallet_balance INTO v_wallet
  FROM public.accounts
  WHERE user_id = '00000000-0000-0000-0000-000000000071';
  SELECT quantity INTO v_quantity
  FROM public.holdings
  WHERE user_id = '00000000-0000-0000-0000-000000000071' AND symbol = 'RELIANCE';
  IF v_status <> 'FILLED' OR v_symbol <> 'RELIANCE' OR
     v_wallet <> 900 OR v_quantity <> 1 THEN
    RAISE EXCEPTION 'successful market settlement was not canonical and atomic';
  END IF;
END;
$$;

-- A settlement failure must not leave a filled order behind.
SELECT pg_temp.reset_paper_fixture(1000, 0, 0, 100, 1000, false);
SELECT pg_temp.assert_paper_error(
  'INSUFFICIENT_QUANTITY',
  $op$
    SELECT public.place_server_advanced_order(
      '00000000-0000-0000-0000-000000000071', 'RELIANCE', 'Reliance',
      'SELL'::public.order_side, 'MARKET'::public.order_kind,
      1, 100, NULL, 'DELIVERY', 'DAY', NULL, NULL, NULL
    )
  $op$
);

DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.orders
  WHERE user_id = '00000000-0000-0000-0000-000000000071';
  IF v_count <> 0 THEN RAISE EXCEPTION 'failed market settlement left an order'; END IF;
END;
$$;

ROLLBACK;

\echo 'server-authoritative paper-order SQL regression checks passed'
