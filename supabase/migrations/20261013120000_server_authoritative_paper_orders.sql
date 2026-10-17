-- Server-authoritative paper execution boundary.
--
-- The browser must not be able to choose a fill price. The frontend server
-- obtains a provider quote, validates the request, and calls these functions
-- with the service role. Direct authenticated execution of the old client RPCs
-- is revoked below.

-- Risk checks use cost basis deliberately. wallet_balance already contains
-- sale proceeds, including realized profit, while funds_used represents the
-- cost basis still held. This is not a mark-to-market equity calculation.
CREATE OR REPLACE FUNCTION public._server_order_risk_check(
  p_user_id uuid,
  p_symbol text,
  p_side public.order_side,
  p_qty numeric,
  p_price numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_account public.accounts;
  v_limits public.risk_limits;
  v_existing public.holdings;
  v_alias public.holdings;
  v_notional numeric;
  v_equity numeric;
  v_position_value numeric;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_symbol IS NULL OR p_symbol !~ '^[A-Z0-9][A-Z0-9&-]{0,29}$' THEN
    RAISE EXCEPTION 'INVALID_SYMBOL';
  END IF;
  IF p_qty IS NULL OR p_qty::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;
  IF p_qty <= 0 OR p_qty <> trunc(p_qty) OR p_qty > 2147483647 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;
  IF p_price IS NULL OR p_price::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  IF p_price <= 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;

  -- Every execution path takes the account lock before a holding lock, just
  -- like settle_fill. The risk row is also locked before any decision is made.
  SELECT * INTO v_account
  FROM public.accounts
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACCOUNT'; END IF;

  SELECT * INTO v_limits
  FROM public.risk_limits
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RISK_LIMITS_MISSING'; END IF;
  IF v_limits.trading_paused THEN RAISE EXCEPTION 'TRADING_PAUSED'; END IF;
  IF v_limits.max_order_value IS NULL OR
     v_limits.max_order_value::text IN ('NaN', 'Infinity', '-Infinity') OR
     v_limits.max_order_value <= 0 OR
     v_limits.max_position_pct IS NULL OR
     v_limits.max_position_pct::text IN ('NaN', 'Infinity', '-Infinity') OR
     v_limits.max_position_pct <= 0 OR v_limits.max_position_pct > 100 THEN
    RAISE EXCEPTION 'RISK_LIMITS_INVALID';
  END IF;

  v_notional := p_qty * p_price;
  IF v_notional IS NULL OR v_notional::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  IF v_notional > v_limits.max_order_value THEN
    RAISE EXCEPTION 'ORDER_VALUE_LIMIT';
  END IF;

  SELECT * INTO v_existing
  FROM public.holdings
  WHERE user_id = p_user_id AND symbol = p_symbol
  FOR UPDATE;

  -- A legacy differently-cased or suffixed holding must not silently become a
  -- second canonical position when the new boundary receives a plain symbol.
  SELECT * INTO v_alias
  FROM public.holdings
  WHERE user_id = p_user_id AND (
    (upper(symbol) = p_symbol AND symbol <> p_symbol) OR
    upper(symbol) = p_symbol || '.NS'
  )
  FOR UPDATE;
  IF v_alias.id IS NOT NULL THEN
    RAISE EXCEPTION 'SYMBOL_ALIAS_CONFLICT';
  END IF;

  IF p_side = 'BUY' THEN
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.quantity IS NULL OR v_existing.quantity::text IN ('NaN', 'Infinity', '-Infinity') OR
         v_existing.quantity <= 0 OR v_existing.avg_price IS NULL OR
         v_existing.avg_price::text IN ('NaN', 'Infinity', '-Infinity') OR
         v_existing.avg_price <= 0 THEN
        RAISE EXCEPTION 'HOLDING_INVALID';
      END IF;
    END IF;

    -- Do not add profit here: settle_fill has already credited realized sale
    -- profit to wallet_balance. A missing/zero equity denominator rejects the
    -- order instead of bypassing the position percentage check.
    v_equity := v_account.wallet_balance + v_account.funds_used;
    IF v_equity IS NULL OR v_equity::text IN ('NaN', 'Infinity', '-Infinity') OR
       v_equity <= 0 THEN
      RAISE EXCEPTION 'NO_EQUITY';
    END IF;
    v_position_value := COALESCE(v_existing.quantity * v_existing.avg_price, 0) + v_notional;
    IF v_position_value > v_equity * v_limits.max_position_pct / 100 THEN
      RAISE EXCEPTION 'POSITION_VALUE_LIMIT';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_server_advanced_order(
  p_user_id uuid,
  p_symbol text,
  p_company text,
  p_side public.order_side,
  p_type public.order_kind,
  p_qty numeric,
  p_price numeric,
  p_limit numeric DEFAULT NULL,
  p_product text DEFAULT 'DELIVERY',
  p_validity text DEFAULT 'DAY',
  p_stop_loss numeric DEFAULT NULL,
  p_target numeric DEFAULT NULL,
  p_trailing numeric DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_symbol text;
  v_product text;
  v_validity text;
  v_value numeric;
  v_entry numeric;
  v_charges numeric;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_side IS NULL THEN RAISE EXCEPTION 'INVALID_SIDE'; END IF;
  IF p_type IS NULL THEN RAISE EXCEPTION 'INVALID_ORDER_TYPE'; END IF;

  -- The API canonicalizes an optional .NS suffix before calling this
  -- boundary. Keep the database representation plain and reject suffixes so
  -- they cannot create a second position key.
  v_symbol := upper(btrim(COALESCE(p_symbol, '')));
  IF v_symbol !~ '^[A-Z0-9][A-Z0-9&-]{0,29}$' THEN
    RAISE EXCEPTION 'INVALID_SYMBOL';
  END IF;

  v_product := upper(btrim(COALESCE(p_product, '')));
  IF v_product <> 'DELIVERY' THEN
    RAISE EXCEPTION 'INVALID_PRODUCT';
  END IF;
  v_validity := upper(btrim(COALESCE(p_validity, '')));
  IF v_validity <> 'DAY' THEN
    RAISE EXCEPTION 'INVALID_VALIDITY';
  END IF;

  IF p_qty IS NULL OR p_qty::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;
  IF p_qty <= 0 OR p_qty <> trunc(p_qty) OR p_qty > 2147483647 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;
  IF p_price IS NULL OR p_price::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  IF p_price <= 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  IF p_type <> 'MARKET' AND (
    p_limit IS NULL OR p_limit::text IN ('NaN', 'Infinity', '-Infinity') OR p_limit <= 0
  ) THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  IF p_type = 'MARKET' AND p_limit IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;

  v_entry := CASE WHEN p_type = 'MARKET' THEN p_price ELSE p_limit END;
  IF p_stop_loss IS NOT NULL AND (
    p_stop_loss::text IN ('NaN', 'Infinity', '-Infinity') OR p_stop_loss <= 0 OR
    (p_side = 'BUY' AND p_stop_loss >= v_entry) OR
    (p_side = 'SELL' AND p_stop_loss <= v_entry)
  ) THEN
    RAISE EXCEPTION 'INVALID_STOP_LOSS';
  END IF;
  IF p_target IS NOT NULL AND (
    p_target::text IN ('NaN', 'Infinity', '-Infinity') OR p_target <= 0 OR
    (p_side = 'BUY' AND p_target <= v_entry) OR
    (p_side = 'SELL' AND p_target >= v_entry)
  ) THEN
    RAISE EXCEPTION 'INVALID_TARGET';
  END IF;
  IF p_trailing IS NOT NULL AND (
    p_trailing::text IN ('NaN', 'Infinity', '-Infinity') OR p_trailing <= 0
  ) THEN
    RAISE EXCEPTION 'INVALID_TRAILING_STOP';
  END IF;

  INSERT INTO public.accounts (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.risk_limits (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  v_value := p_qty * v_entry;
  v_charges := round(v_value * 0.00035, 2);
  PERFORM public._server_order_risk_check(
    p_user_id, v_symbol, p_side, p_qty, v_entry
  );

  IF p_type = 'MARKET' THEN
    PERFORM public.settle_fill(
      p_user_id, v_symbol, COALESCE(NULLIF(btrim(p_company), ''), v_symbol),
      p_side, p_qty, p_price
    );
    INSERT INTO public.orders (
      user_id, symbol, company, side, order_type, quantity, filled_quantity,
      limit_price, price, status, filled_at, product, validity,
      estimated_charges, stop_loss, target_price, trailing_stop
    ) VALUES (
      p_user_id, v_symbol, COALESCE(NULLIF(btrim(p_company), ''), v_symbol), p_side,
      p_type, p_qty::integer, p_qty::integer, NULL, p_price, 'FILLED', now(), v_product,
      v_validity, v_charges, p_stop_loss, p_target, p_trailing
    ) RETURNING * INTO v_order;
  ELSE
    INSERT INTO public.orders (
      user_id, symbol, company, side, order_type, quantity, filled_quantity,
      limit_price, price, status, product, validity, estimated_charges,
      stop_loss, target_price, trailing_stop
    ) VALUES (
      p_user_id, v_symbol, COALESCE(NULLIF(btrim(p_company), ''), v_symbol), p_side,
      p_type, p_qty::integer, 0, p_limit, p_price, 'OPEN', v_product, v_validity,
      v_charges, p_stop_loss, p_target, p_trailing
    ) RETURNING * INTO v_order;
  END IF;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.fill_server_open_order(
  p_user_id uuid,
  p_order_id uuid,
  p_price numeric
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders;
  v_symbol text;
  v_product text;
  v_validity text;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_price IS NULL OR p_price::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  IF p_price <= 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;

  -- Serialize the order state before checking it. The shared risk checker then
  -- takes account and holding locks in settle_fill's order.
  SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND user_id = p_user_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'OPEN' THEN RAISE EXCEPTION 'ORDER_NOT_OPEN'; END IF;

  v_symbol := upper(btrim(COALESCE(v_order.symbol, '')));
  IF v_symbol !~ '^[A-Z0-9][A-Z0-9&-]{0,29}$' THEN
    RAISE EXCEPTION 'INVALID_SYMBOL';
  END IF;
  v_product := upper(btrim(COALESCE(v_order.product, '')));
  IF v_product <> 'DELIVERY' THEN RAISE EXCEPTION 'INVALID_PRODUCT'; END IF;
  v_validity := upper(btrim(COALESCE(v_order.validity, '')));
  IF v_validity <> 'DAY' THEN RAISE EXCEPTION 'INVALID_VALIDITY'; END IF;

  IF v_order.order_type NOT IN ('LIMIT', 'STOP') OR v_order.limit_price IS NULL OR
     v_order.limit_price::text IN ('NaN', 'Infinity', '-Infinity') OR
     v_order.limit_price <= 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  IF v_order.stop_loss IS NOT NULL AND (
    v_order.stop_loss::text IN ('NaN', 'Infinity', '-Infinity') OR v_order.stop_loss <= 0 OR
    (v_order.side = 'BUY' AND v_order.stop_loss >= v_order.limit_price) OR
    (v_order.side = 'SELL' AND v_order.stop_loss <= v_order.limit_price)
  ) THEN
    RAISE EXCEPTION 'INVALID_STOP_LOSS';
  END IF;
  IF v_order.target_price IS NOT NULL AND (
    v_order.target_price::text IN ('NaN', 'Infinity', '-Infinity') OR v_order.target_price <= 0 OR
    (v_order.side = 'BUY' AND v_order.target_price <= v_order.limit_price) OR
    (v_order.side = 'SELL' AND v_order.target_price >= v_order.limit_price)
  ) THEN
    RAISE EXCEPTION 'INVALID_TARGET';
  END IF;
  IF v_order.trailing_stop IS NOT NULL AND (
    v_order.trailing_stop::text IN ('NaN', 'Infinity', '-Infinity') OR
    v_order.trailing_stop <= 0
  ) THEN
    RAISE EXCEPTION 'INVALID_TRAILING_STOP';
  END IF;
  IF (v_order.order_type = 'LIMIT' AND
      ((v_order.side = 'BUY' AND p_price > v_order.limit_price) OR
       (v_order.side = 'SELL' AND p_price < v_order.limit_price))) OR
     (v_order.order_type = 'STOP' AND
      ((v_order.side = 'BUY' AND p_price < v_order.limit_price) OR
       (v_order.side = 'SELL' AND p_price > v_order.limit_price))) THEN
    RAISE EXCEPTION 'PRICE_CONDITION_NOT_MET';
  END IF;

  -- Re-run notional and cost-basis position checks at the actual fill price;
  -- creation-time checks cannot account for earlier fills or wallet changes.
  PERFORM public._server_order_risk_check(
    p_user_id, v_symbol, v_order.side, v_order.quantity, p_price
  );
  PERFORM public.settle_fill(
    p_user_id, v_symbol, v_order.company, v_order.side,
    v_order.quantity, p_price
  );
  UPDATE public.orders SET
    symbol = v_symbol, product = v_product, validity = v_validity,
    status = 'FILLED', filled_at = now(), price = p_price,
    filled_quantity = quantity,
    estimated_charges = round(quantity * p_price * 0.00035, 2)
    WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_server_open_order(
  p_user_id uuid,
  p_order_id uuid
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order public.orders;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  UPDATE public.orders SET status = 'CANCELLED'
    WHERE id = p_order_id AND user_id = p_user_id AND status = 'OPEN'
    RETURNING * INTO v_order;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_OPEN'; END IF;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.place_advanced_order(
  text, text, public.order_side, public.order_kind, numeric, numeric, numeric,
  text, text, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.place_simulated_order(
  text, text, public.order_side, public.order_kind, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fill_open_order(uuid, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_open_order(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.modify_open_order(uuid, integer, numeric, numeric, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.settle_fill(
  uuid, text, text, public.order_side, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;

-- The pre-market-price fill signature was dropped by the prior migration. Keep
-- this migration safe for databases that still have that historical overload.
DO $$
BEGIN
  IF to_regprocedure('public.fill_open_order(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fill_open_order(uuid) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._server_order_risk_check(
  uuid, text, public.order_side, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.place_server_advanced_order(
  uuid, text, text, public.order_side, public.order_kind, numeric, numeric, numeric,
  text, text, numeric, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fill_server_open_order(uuid, uuid, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_server_open_order(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.place_server_advanced_order(
  uuid, text, text, public.order_side, public.order_kind, numeric, numeric, numeric,
  text, text, numeric, numeric, numeric
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fill_server_open_order(uuid, uuid, numeric)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_server_open_order(uuid, uuid)
  TO service_role;
