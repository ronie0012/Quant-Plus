CREATE TYPE public.order_side AS ENUM ('BUY','SELL');
CREATE TYPE public.order_kind AS ENUM ('MARKET','LIMIT','STOP');
CREATE TYPE public.order_status AS ENUM ('OPEN','FILLED','CANCELLED','REJECTED');

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  company text NOT NULL DEFAULT '',
  side public.order_side NOT NULL,
  order_type public.order_kind NOT NULL DEFAULT 'MARKET',
  quantity integer NOT NULL CHECK (quantity > 0),
  limit_price numeric(14,2),
  price numeric(14,2) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'OPEN',
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_created_idx ON public.orders (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own orders" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create their own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own orders" ON public.orders FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete their own orders" ON public.orders FOR DELETE TO authenticated USING (auth.uid() = user_id);