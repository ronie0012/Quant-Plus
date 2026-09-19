REVOKE INSERT, UPDATE, DELETE ON public.accounts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.holdings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallet_transactions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
GRANT SELECT ON public.accounts, public.holdings, public.wallet_transactions, public.orders TO authenticated;

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_wallet_balance_nonnegative;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_wallet_balance_nonnegative CHECK (wallet_balance >= 0);
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_funds_used_nonnegative;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_funds_used_nonnegative CHECK (funds_used >= 0);
ALTER TABLE public.holdings DROP CONSTRAINT IF EXISTS holdings_quantity_positive;
ALTER TABLE public.holdings ADD CONSTRAINT holdings_quantity_positive CHECK (quantity > 0);
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_filled_quantity_valid;
ALTER TABLE public.orders ADD CONSTRAINT orders_filled_quantity_valid CHECK (filled_quantity >= 0 AND filled_quantity <= quantity);