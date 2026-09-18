REVOKE ALL ON FUNCTION public.fund_wallet(numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.place_simulated_order(text, text, public.order_side, public.order_kind, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fill_open_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_open_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.settle_fill(uuid, text, text, public.order_side, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fund_wallet(numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_simulated_order(text, text, public.order_side, public.order_kind, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fill_open_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_open_order(uuid) TO authenticated;