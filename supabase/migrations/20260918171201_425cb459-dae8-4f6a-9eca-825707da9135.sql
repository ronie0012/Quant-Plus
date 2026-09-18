ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS wallet_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS holdings_user_symbol_idx ON public.holdings (user_id, symbol);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user_created_idx ON public.wallet_transactions (user_id, created_at DESC);
GRANT SELECT, INSERT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users read own wallet transactions" ON public.wallet_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users insert own wallet transactions" ON public.wallet_transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Backfill existing accounts
UPDATE public.accounts
SET wallet_balance = GREATEST(total_funds - funds_used, 0),
    onboarded = (total_funds > 0)
WHERE wallet_balance = 0;

CREATE OR REPLACE FUNCTION public.fund_wallet(p_amount numeric, p_kind text DEFAULT 'DEPOSIT')
RETURNS public.accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.accounts;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  INSERT INTO public.accounts (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;

  IF p_kind = 'WITHDRAW' THEN
    SELECT * INTO v_row FROM public.accounts WHERE user_id = v_uid FOR UPDATE;
    IF v_row.wallet_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
    UPDATE public.accounts
      SET wallet_balance = wallet_balance - p_amount,
          total_funds = GREATEST(total_funds - p_amount, 0)
      WHERE user_id = v_uid RETURNING * INTO v_row;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, note)
      VALUES (v_uid, 'WITHDRAW', -p_amount, v_row.wallet_balance, 'Simulated withdrawal');
  ELSE
    UPDATE public.accounts
      SET wallet_balance = wallet_balance + p_amount,
          total_funds = total_funds + p_amount,
          onboarded = true
      WHERE user_id = v_uid RETURNING * INTO v_row;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, note)
      VALUES (v_uid, 'DEPOSIT', p_amount, v_row.wallet_balance, 'Simulated deposit');
  END IF;

  UPDATE public.accounts
    SET profit_pct = CASE WHEN total_funds > 0 THEN round((profit / total_funds) * 100, 2) ELSE 0 END
    WHERE user_id = v_uid RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_fill(
  p_uid uuid, p_symbol text, p_company text, p_side public.order_side,
  p_qty numeric, p_price numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_amount numeric := p_qty * p_price;
  v_bal numeric;
  v_hold public.holdings;
BEGIN
  SELECT wallet_balance INTO v_bal FROM public.accounts WHERE user_id = p_uid FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'NO_ACCOUNT'; END IF;

  SELECT * INTO v_hold FROM public.holdings WHERE user_id = p_uid AND symbol = p_symbol FOR UPDATE;

  IF p_side = 'BUY' THEN
    IF v_bal < v_amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
    IF v_hold.id IS NULL THEN
      INSERT INTO public.holdings (user_id, symbol, company, quantity, avg_price, last_price)
        VALUES (p_uid, p_symbol, COALESCE(NULLIF(p_company, ''), p_symbol), p_qty, p_price, p_price);
    ELSE
      UPDATE public.holdings
        SET quantity = v_hold.quantity + p_qty,
            avg_price = ((v_hold.quantity * v_hold.avg_price) + v_amount) / (v_hold.quantity + p_qty),
            last_price = p_price
        WHERE id = v_hold.id;
    END IF;
    UPDATE public.accounts
      SET wallet_balance = wallet_balance - v_amount, funds_used = funds_used + v_amount
      WHERE user_id = p_uid;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, note)
      VALUES (p_uid, 'TRADE_BUY', -v_amount, v_bal - v_amount, p_symbol || ' buy ' || p_qty);
  ELSE
    IF v_hold.id IS NULL OR v_hold.quantity < p_qty THEN RAISE EXCEPTION 'INSUFFICIENT_QUANTITY'; END IF;
    UPDATE public.accounts
      SET wallet_balance = wallet_balance + v_amount,
          funds_used = GREATEST(funds_used - (v_hold.avg_price * p_qty), 0),
          profit = profit + ((p_price - v_hold.avg_price) * p_qty)
      WHERE user_id = p_uid;
    IF v_hold.quantity - p_qty <= 0 THEN
      DELETE FROM public.holdings WHERE id = v_hold.id;
    ELSE
      UPDATE public.holdings SET quantity = v_hold.quantity - p_qty, last_price = p_price WHERE id = v_hold.id;
    END IF;
    INSERT INTO public.wallet_transactions (user_id, kind, amount, balance_after, note)
      VALUES (p_uid, 'TRADE_SELL', v_amount, v_bal + v_amount, p_symbol || ' sell ' || p_qty);
  END IF;

  UPDATE public.accounts
    SET profit_pct = CASE WHEN total_funds > 0 THEN round((profit / total_funds) * 100, 2) ELSE 0 END
    WHERE user_id = p_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_simulated_order(
  p_symbol text, p_company text, p_side public.order_side, p_type public.order_kind,
  p_qty numeric, p_price numeric, p_limit numeric DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_order public.orders;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF p_price IS NULL OR p_price <= 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;

  IF p_type = 'MARKET' THEN
    PERFORM public.settle_fill(v_uid, p_symbol, p_company, p_side, p_qty, p_price);
    INSERT INTO public.orders (user_id, symbol, company, side, order_type, quantity, limit_price, price, status, filled_at)
      VALUES (v_uid, p_symbol, p_company, p_side, p_type, p_qty, NULL, p_price, 'FILLED', now())
      RETURNING * INTO v_order;
  ELSE
    INSERT INTO public.orders (user_id, symbol, company, side, order_type, quantity, limit_price, price, status)
      VALUES (v_uid, p_symbol, p_company, p_side, p_type, p_qty, COALESCE(p_limit, p_price), p_price, 'OPEN')
      RETURNING * INTO v_order;
  END IF;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.fill_open_order(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_order public.orders; v_price numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND user_id = v_uid FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.status <> 'OPEN' THEN RAISE EXCEPTION 'ORDER_NOT_OPEN'; END IF;

  v_price := COALESCE(v_order.limit_price, v_order.price);
  PERFORM public.settle_fill(v_uid, v_order.symbol, v_order.company, v_order.side, v_order.quantity, v_price);
  UPDATE public.orders SET status = 'FILLED', filled_at = now(), price = v_price
    WHERE id = v_order.id RETURNING * INTO v_order;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_open_order(p_order_id uuid)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_order public.orders;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  UPDATE public.orders SET status = 'CANCELLED'
    WHERE id = p_order_id AND user_id = v_uid AND status = 'OPEN'
    RETURNING * INTO v_order;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_OPEN'; END IF;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_fill(uuid, text, text, public.order_side, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_wallet(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_simulated_order(text, text, public.order_side, public.order_kind, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fill_open_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_open_order(uuid) TO authenticated;

-- New users start with an empty, unfunded wallet and no fabricated holdings
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  );

  INSERT INTO public.accounts (user_id, total_funds, funds_used, profit, profit_pct, wallet_balance, onboarded)
  VALUES (NEW.id, 0, 0, 0, 0, 0, false);

  INSERT INTO public.watchlist_items (user_id, symbol, company, price, change_pct) VALUES
    (NEW.id, 'RELIANCE', 'Reliance Industries', 1428.00, 1.82),
    (NEW.id, 'TCS', 'Tata Consultancy Services', 3812.00, 0.42),
    (NEW.id, 'INFY', 'Infosys', 1642.00, -0.71),
    (NEW.id, 'HDFCBANK', 'HDFC Bank', 1734.00, 1.14),
    (NEW.id, 'ITC', 'ITC Ltd', 486.30, 0.28),
    (NEW.id, 'TATAMOTORS', 'Tata Motors', 942.75, -1.06);

  RETURN NEW;
END;
$function$;