ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT 'DELIVERY',
  ADD COLUMN IF NOT EXISTS validity text NOT NULL DEFAULT 'DAY',
  ADD COLUMN IF NOT EXISTS filled_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_charges numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stop_loss numeric(14,2),
  ADD COLUMN IF NOT EXISTS target_price numeric(14,2),
  ADD COLUMN IF NOT EXISTS trailing_stop numeric(14,2),
  ADD COLUMN IF NOT EXISTS parent_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.orders SET filled_quantity = quantity WHERE status = 'FILLED' AND filled_quantity = 0;

CREATE TABLE public.trade_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  symbol text NOT NULL,
  thesis text NOT NULL DEFAULT '',
  evidence text[] NOT NULL DEFAULT '{}',
  risks text[] NOT NULL DEFAULT '{}',
  invalidation text NOT NULL DEFAULT '',
  planned_exit text NOT NULL DEFAULT '',
  reflection text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT 'OPEN' CHECK (outcome IN ('OPEN','WIN','LOSS','FLAT','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_journal TO authenticated;
GRANT ALL ON public.trade_journal TO service_role;
ALTER TABLE public.trade_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own journal" ON public.trade_journal FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own journal" ON public.trade_journal FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own journal" ON public.trade_journal FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own journal" ON public.trade_journal FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('PRICE_ABOVE','PRICE_BELOW','MOVE_PERCENT','VOLUME','NEWS')),
  threshold numeric,
  note text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT ALL ON public.price_alerts TO service_role;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own alerts" ON public.price_alerts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own alerts" ON public.price_alerts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own alerts" ON public.price_alerts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own alerts" ON public.price_alerts FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.saved_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_workspaces TO authenticated;
GRANT ALL ON public.saved_workspaces TO service_role;
ALTER TABLE public.saved_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own workspaces" ON public.saved_workspaces FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own workspaces" ON public.saved_workspaces FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own workspaces" ON public.saved_workspaces FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own workspaces" ON public.saved_workspaces FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.trading_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  density text NOT NULL DEFAULT 'COMFORTABLE' CHECK (density IN ('COMFORTABLE','COMPACT')),
  calm_mode boolean NOT NULL DEFAULT false,
  default_order_type public.order_kind NOT NULL DEFAULT 'MARKET',
  default_product text NOT NULL DEFAULT 'DELIVERY',
  default_quantity integer NOT NULL DEFAULT 10 CHECK (default_quantity > 0),
  chart_type text NOT NULL DEFAULT 'CANDLE' CHECK (chart_type IN ('CANDLE','LINE','AREA')),
  show_volume boolean NOT NULL DEFAULT true,
  notifications jsonb NOT NULL DEFAULT '{"orders":true,"alerts":true,"news":false}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trading_preferences TO authenticated;
GRANT ALL ON public.trading_preferences TO service_role;
ALTER TABLE public.trading_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own trading preferences" ON public.trading_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own trading preferences" ON public.trading_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own trading preferences" ON public.trading_preferences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own trading preferences" ON public.trading_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.risk_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_loss_limit numeric NOT NULL DEFAULT 50000 CHECK (daily_loss_limit >= 0),
  max_order_value numeric NOT NULL DEFAULT 1000000 CHECK (max_order_value > 0),
  max_position_pct numeric NOT NULL DEFAULT 25 CHECK (max_position_pct > 0 AND max_position_pct <= 100),
  confirmation_above numeric NOT NULL DEFAULT 500000 CHECK (confirmation_above >= 0),
  trading_paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_limits TO authenticated;
GRANT ALL ON public.risk_limits TO service_role;
ALTER TABLE public.risk_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own risk limits" ON public.risk_limits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own risk limits" ON public.risk_limits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own risk limits" ON public.risk_limits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own risk limits" ON public.risk_limits FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER touch_trade_journal BEFORE UPDATE ON public.trade_journal FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_price_alerts BEFORE UPDATE ON public.price_alerts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_saved_workspaces BEFORE UPDATE ON public.saved_workspaces FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_trading_preferences BEFORE UPDATE ON public.trading_preferences FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_risk_limits BEFORE UPDATE ON public.risk_limits FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER touch_orders BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.place_advanced_order(
  p_symbol text, p_company text, p_side public.order_side, p_type public.order_kind,
  p_qty numeric, p_price numeric, p_limit numeric DEFAULT NULL,
  p_product text DEFAULT 'DELIVERY', p_validity text DEFAULT 'DAY',
  p_stop_loss numeric DEFAULT NULL, p_target numeric DEFAULT NULL, p_trailing numeric DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_order public.orders; v_limits public.risk_limits; v_value numeric; v_charges numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF p_price IS NULL OR p_price <= 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  v_value := p_qty * COALESCE(p_limit, p_price);
  v_charges := round(v_value * 0.00035, 2);
  INSERT INTO public.risk_limits (user_id) VALUES (v_uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_limits FROM public.risk_limits WHERE user_id = v_uid;
  IF v_limits.trading_paused THEN RAISE EXCEPTION 'TRADING_PAUSED'; END IF;
  IF v_value > v_limits.max_order_value THEN RAISE EXCEPTION 'ORDER_VALUE_LIMIT'; END IF;
  IF p_stop_loss IS NOT NULL AND p_stop_loss <= 0 THEN RAISE EXCEPTION 'INVALID_STOP_LOSS'; END IF;
  IF p_target IS NOT NULL AND p_target <= 0 THEN RAISE EXCEPTION 'INVALID_TARGET'; END IF;

  IF p_type = 'MARKET' THEN
    PERFORM public.settle_fill(v_uid, p_symbol, p_company, p_side, p_qty, p_price);
    INSERT INTO public.orders (user_id,symbol,company,side,order_type,quantity,filled_quantity,limit_price,price,status,filled_at,product,validity,estimated_charges,stop_loss,target_price,trailing_stop)
    VALUES (v_uid,p_symbol,p_company,p_side,p_type,p_qty,p_qty,NULL,p_price,'FILLED',now(),p_product,p_validity,v_charges,p_stop_loss,p_target,p_trailing)
    RETURNING * INTO v_order;
  ELSE
    INSERT INTO public.orders (user_id,symbol,company,side,order_type,quantity,filled_quantity,limit_price,price,status,product,validity,estimated_charges,stop_loss,target_price,trailing_stop)
    VALUES (v_uid,p_symbol,p_company,p_side,p_type,p_qty,0,COALESCE(p_limit,p_price),p_price,'OPEN',p_product,p_validity,v_charges,p_stop_loss,p_target,p_trailing)
    RETURNING * INTO v_order;
  END IF;
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.modify_open_order(
  p_order_id uuid, p_qty integer, p_limit numeric, p_stop_loss numeric DEFAULT NULL, p_target numeric DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_order public.orders;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_qty <= 0 OR p_limit <= 0 THEN RAISE EXCEPTION 'INVALID_ORDER_CHANGE'; END IF;
  UPDATE public.orders
  SET quantity=p_qty, limit_price=p_limit, stop_loss=p_stop_loss, target_price=p_target
  WHERE id=p_order_id AND user_id=v_uid AND status='OPEN'
  RETURNING * INTO v_order;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_OPEN'; END IF;
  RETURN v_order;
END;
$$;

REVOKE ALL ON FUNCTION public.place_advanced_order(text,text,public.order_side,public.order_kind,numeric,numeric,numeric,text,text,numeric,numeric,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.modify_open_order(uuid,integer,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_advanced_order(text,text,public.order_side,public.order_kind,numeric,numeric,numeric,text,text,numeric,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.modify_open_order(uuid,integer,numeric,numeric,numeric) TO authenticated;