-- Paper settlement only. Fyers is used by the website for market data, never orders.
-- Retire the old entry point that filled at the stored limit without a market quote.
DROP FUNCTION public.fill_open_order(uuid);

CREATE FUNCTION public.fill_open_order(p_order_id uuid, p_price numeric)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_limits public.risk_limits;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_price IS NULL OR p_price <= 0 OR p_price::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  SELECT * INTO v_order FROM public.orders
    WHERE id = p_order_id AND user_id = v_uid FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'OPEN' THEN RAISE EXCEPTION 'ORDER_NOT_OPEN'; END IF;
  SELECT * INTO v_limits FROM public.risk_limits WHERE user_id = v_uid;
  IF v_limits.trading_paused THEN RAISE EXCEPTION 'TRADING_PAUSED'; END IF;
  IF p_price * v_order.quantity > v_limits.max_order_value THEN
    RAISE EXCEPTION 'ORDER_VALUE_LIMIT';
  END IF;
  IF v_order.limit_price IS NULL THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  IF (v_order.order_type = 'LIMIT' AND
      ((v_order.side = 'BUY' AND p_price > v_order.limit_price) OR
       (v_order.side = 'SELL' AND p_price < v_order.limit_price))) OR
     (v_order.order_type = 'STOP' AND
      ((v_order.side = 'BUY' AND p_price < v_order.limit_price) OR
       (v_order.side = 'SELL' AND p_price > v_order.limit_price))) THEN
    RAISE EXCEPTION 'PRICE_CONDITION_NOT_MET';
  END IF;
  PERFORM public.settle_fill(v_uid, v_order.symbol, v_order.company,
    v_order.side, v_order.quantity, p_price);
  UPDATE public.orders SET status = 'FILLED', filled_at = now(), price = p_price,
    filled_quantity = quantity, estimated_charges = round(quantity * p_price * 0.00035, 2)
    WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_open_order(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fill_open_order(uuid, numeric) TO authenticated;
