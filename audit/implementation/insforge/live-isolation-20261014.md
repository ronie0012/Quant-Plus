# Live InsForge isolation run — 2026-10-14

Command: `INSFORGE_ANON_KEY=<public anon key> node scripts/live-insforge-isolation.mjs`

Two throwaway users were created (email verification temporarily disabled), exercised through the
real hosted adapter and REST with their own tokens, then deleted; the verification setting was
restored. All 29 checks passed:

- server-side identity verification for both users (the live API returns no `role` for end users;
  the first run exposed that bug, which was fixed before this run)
- hosted market order settled; replay of the same intent returned the original result
- book reconciled after settlement
- each user reads only their own `paper_books`, `paper_ledger`, `paper_orders`, `paper_fills`,
  `paper_events`; filtering by the other user's id returns nothing; `paper_intents` is unreadable
- browser tokens cannot insert ledger rows (403), change balances (403) or call `paper_commit_book` (403)
- two concurrent commits from the same version: one 200, one 400 (`BOOK_VERSION_CONFLICT`)
- a commit whose cash does not match the relational ledger is refused (`BOOK_RECONCILIATION_FAILED`)
- deleting the users cascaded their book rows; email verification restored to `true`
