INSERT INTO public.accounts (user_id, currency, total_funds, funds_used, profit, profit_pct, data_source)
SELECT u.id, 'INR', 250000, 142500, 18420, 12.9, 'simulated'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.user_id = u.id);

INSERT INTO public.holdings (user_id, symbol, company, sector, quantity, avg_price, last_price)
SELECT u.id, h.symbol, h.company, h.sector, h.quantity, h.avg_price, h.last_price
FROM auth.users u
CROSS JOIN (VALUES
  ('RELIANCE','Reliance Industries','Energy',42,2680.40,2814.55),
  ('TCS','Tata Consultancy Services','Technology',26,3820.10,3742.85),
  ('HDFCBANK','HDFC Bank','Financials',60,1592.30,1678.40),
  ('INFY','Infosys','Technology',48,1498.75,1462.20),
  ('LT','Larsen & Toubro','Industrials',18,3320.00,3596.75)
) AS h(symbol, company, sector, quantity, avg_price, last_price)
WHERE NOT EXISTS (SELECT 1 FROM public.holdings x WHERE x.user_id = u.id);

INSERT INTO public.watchlist_items (user_id, symbol, company, price, change_pct)
SELECT u.id, w.symbol, w.company, w.price, w.change_pct
FROM auth.users u
CROSS JOIN (VALUES
  ('RELIANCE','Reliance Industries',2814.55,0.92),
  ('TCS','Tata Consultancy Services',3742.85,-0.41),
  ('INFY','Infosys',1462.20,-0.68),
  ('HDFCBANK','HDFC Bank',1678.40,1.14),
  ('ITC','ITC Limited',462.75,0.36),
  ('TATAMOTORS','Tata Motors',1024.60,2.08)
) AS w(symbol, company, price, change_pct)
WHERE NOT EXISTS (SELECT 1 FROM public.watchlist_items x WHERE x.user_id = u.id);

INSERT INTO public.analyses (user_id, symbol, verdict, conviction, risk, summary)
SELECT u.id, a.symbol, a.verdict, a.conviction, a.risk, a.summary
FROM auth.users u
CROSS JOIN (VALUES
  ('RELIANCE','BUY',84,'MODERATE','Retail and telecom momentum offset refining softness; committee leans constructive.'),
  ('TCS','HOLD',71,'LOW','Deal wins steady but margin guidance caps near-term upside.'),
  ('INFY','SELL',78,'ELEVATED','Discretionary spend weakness and downgrade cycle weigh on the setup.'),
  ('HDFCBANK','BUY',76,'MODERATE','Deposit repricing improves; valuation still below historical mean.')
) AS a(symbol, verdict, conviction, risk, summary)
WHERE NOT EXISTS (SELECT 1 FROM public.analyses x WHERE x.user_id = u.id);