-- Backout for migrations 20261014130103_create-paper-book.sql and
-- 20261014130652_single-book-authority.sql. Destroys hosted paper-book data.
-- Export first (npx -y @insforge/cli db export) and run only after the app has
-- been switched back to the local book.
DROP FUNCTION IF EXISTS public.paper_commit_book(uuid, bigint, jsonb, text, jsonb, jsonb, jsonb, jsonb, jsonb);
DROP TABLE IF EXISTS public.paper_events, public.paper_ledger, public.paper_fills, public.paper_intents,
  public.paper_orders, public.paper_books CASCADE;
DROP FUNCTION IF EXISTS public.paper_append_only();
