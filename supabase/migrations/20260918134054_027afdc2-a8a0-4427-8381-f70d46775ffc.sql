
CREATE TABLE public.accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'INR',
  total_funds numeric NOT NULL DEFAULT 0,
  funds_used numeric NOT NULL DEFAULT 0,
  profit numeric NOT NULL DEFAULT 0,
  profit_pct numeric NOT NULL DEFAULT 0,
  data_source text NOT NULL DEFAULT 'simulated',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own account" ON public.accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  company text NOT NULL,
  sector text,
  quantity numeric NOT NULL DEFAULT 0,
  avg_price numeric NOT NULL DEFAULT 0,
  last_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO authenticated;
GRANT ALL ON public.holdings TO service_role;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own holdings" ON public.holdings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.watchlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  company text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  change_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist_items TO authenticated;
GRANT ALL ON public.watchlist_items TO service_role;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own watchlist" ON public.watchlist_items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  verdict text NOT NULL,
  conviction numeric NOT NULL DEFAULT 0,
  risk text NOT NULL DEFAULT 'Moderate',
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analyses TO authenticated;
GRANT ALL ON public.analyses TO service_role;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own analyses" ON public.analyses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.market_instruments (
  symbol text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'index',
  currency text NOT NULL DEFAULT 'INR',
  value numeric NOT NULL,
  change_abs numeric NOT NULL,
  change_pct numeric NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  data_source text NOT NULL DEFAULT 'simulated',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_instruments TO authenticated;
GRANT ALL ON public.market_instruments TO service_role;
ALTER TABLE public.market_instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read market instruments" ON public.market_instruments FOR SELECT TO authenticated USING (true);

CREATE TABLE public.market_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  headline text NOT NULL,
  source text NOT NULL,
  category text NOT NULL,
  sentiment text NOT NULL,
  impact text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  data_source text NOT NULL DEFAULT 'simulated'
);
GRANT SELECT ON public.market_news TO authenticated;
GRANT ALL ON public.market_news TO service_role;
ALTER TABLE public.market_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read market news" ON public.market_news FOR SELECT TO authenticated USING (true);

CREATE TABLE public.market_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  region text NOT NULL,
  importance text NOT NULL,
  event_time timestamptz NOT NULL,
  data_source text NOT NULL DEFAULT 'simulated'
);
GRANT SELECT ON public.market_events TO authenticated;
GRANT ALL ON public.market_events TO service_role;
ALTER TABLE public.market_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read market events" ON public.market_events FOR SELECT TO authenticated USING (true);

CREATE TABLE public.market_sentiment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  score int NOT NULL,
  label text NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_source text NOT NULL DEFAULT 'simulated',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_sentiment TO authenticated;
GRANT ALL ON public.market_sentiment TO service_role;
ALTER TABLE public.market_sentiment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read market sentiment" ON public.market_sentiment FOR SELECT TO authenticated USING (true);

INSERT INTO public.market_instruments (symbol, name, kind, currency, value, change_abs, change_pct, sort_order) VALUES
  ('NIFTY50', 'NIFTY 50', 'index', 'INR', 25421.60, 214.50, 0.85, 1),
  ('SENSEX', 'SENSEX', 'index', 'INR', 83142.80, 586.20, 0.71, 2),
  ('GOLD', 'GOLD', 'commodity', 'INR', 74820, 253.00, 0.34, 3),
  ('SILVER', 'SILVER', 'commodity', 'INR', 91240, -164.00, -0.18, 4);

INSERT INTO public.market_sentiment (score, label, breakdown) VALUES
  (72, 'BULLISH', '[{"label":"News","value":"Positive"},{"label":"Technical","value":"Bullish"},{"label":"Macro","value":"Neutral"},{"label":"FII / DII","value":"Net buyers"},{"label":"Volatility","value":"Moderate"}]'::jsonb);

INSERT INTO public.market_news (headline, source, category, sentiment, impact, published_at) VALUES
  ('RBI holds repo rate steady, flags easing inflation path', 'Policy desk', 'MACRO', 'POSITIVE', 'HIGH', now() - interval '12 minutes'),
  ('US inflation print comes in hotter than expected, rate cut odds slip', 'Global desk', 'GLOBAL', 'NEGATIVE', 'HIGH', now() - interval '28 minutes'),
  ('Crude slips below key level as supply outlook improves', 'Commodities desk', 'COMMODITY', 'POSITIVE', 'MEDIUM', now() - interval '54 minutes'),
  ('FIIs turn net buyers in cash market for the third session', 'Flows desk', 'FLOWS', 'POSITIVE', 'MEDIUM', now() - interval '1 hour 22 minutes'),
  ('IT majors guide cautiously ahead of quarterly results', 'Equities desk', 'SECTOR', 'NEUTRAL', 'MEDIUM', now() - interval '2 hours'),
  ('Rupee steadies after central bank intervention in forwards', 'Currency desk', 'MACRO', 'NEUTRAL', 'LOW', now() - interval '3 hours 10 minutes');

INSERT INTO public.market_events (event, region, importance, event_time) VALUES
  ('CPI Inflation (YoY)', 'INDIA', 'HIGH', now() + interval '3 hours'),
  ('Fed Interest Rate Decision', 'US', 'HIGH', now() + interval '1 day 2 hours'),
  ('Crude Oil Inventories', 'US', 'MEDIUM', now() + interval '1 day 6 hours'),
  ('RBI Monetary Policy Minutes', 'INDIA', 'MEDIUM', now() + interval '2 days'),
  ('Non-Farm Payrolls', 'US', 'HIGH', now() + interval '3 days 4 hours'),
  ('India GDP (QoQ)', 'INDIA', 'HIGH', now() + interval '5 days');

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

  INSERT INTO public.accounts (user_id, total_funds, funds_used, profit, profit_pct)
  VALUES (NEW.id, 250000, 142500, 18420, 12.9);

  INSERT INTO public.holdings (user_id, symbol, company, sector, quantity, avg_price, last_price) VALUES
    (NEW.id, 'RELIANCE', 'Reliance Industries', 'Energy', 18, 1362.40, 1428.00),
    (NEW.id, 'TCS', 'Tata Consultancy Services', 'Technology', 9, 3724.10, 3812.00),
    (NEW.id, 'HDFCBANK', 'HDFC Bank', 'Financials', 24, 1668.00, 1734.00),
    (NEW.id, 'INFY', 'Infosys', 'Technology', 15, 1682.50, 1642.00),
    (NEW.id, 'LT', 'Larsen & Toubro', 'Industrials', 6, 3450.00, 3596.00);

  INSERT INTO public.watchlist_items (user_id, symbol, company, price, change_pct) VALUES
    (NEW.id, 'RELIANCE', 'Reliance Industries', 1428.00, 1.82),
    (NEW.id, 'TCS', 'Tata Consultancy Services', 3812.00, 0.42),
    (NEW.id, 'INFY', 'Infosys', 1642.00, -0.71),
    (NEW.id, 'HDFCBANK', 'HDFC Bank', 1734.00, 1.14),
    (NEW.id, 'ITC', 'ITC Ltd', 486.30, 0.28),
    (NEW.id, 'TATAMOTORS', 'Tata Motors', 942.75, -1.06);

  INSERT INTO public.analyses (user_id, symbol, verdict, conviction, risk, summary, created_at) VALUES
    (NEW.id, 'RELIANCE', 'BUY', 84, 'Moderate', 'Retail and telecom momentum offsets refining softness.', now() - interval '4 hours'),
    (NEW.id, 'TCS', 'HOLD', 71, 'Low', 'Stable margins, muted near-term deal commentary.', now() - interval '1 day'),
    (NEW.id, 'INFY', 'SELL', 78, 'High', 'Guidance risk into results with weakening breadth.', now() - interval '2 days'),
    (NEW.id, 'HDFCBANK', 'BUY', 76, 'Moderate', 'Deposit growth improving, valuation reasonable.', now() - interval '3 days');

  RETURN NEW;
END;
$function$;
