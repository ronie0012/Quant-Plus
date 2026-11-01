# Live InsForge isolation run — 2026-10-19

Command: `INSFORGE_ANON_KEY=<public anon key> node scripts/live-insforge-isolation.mjs`

The linked Quant-Plus project was exercised with two throwaway users. The
users were deleted in cleanup and the prior email-verification setting was
restored. No credentials, user identifiers or private payloads are recorded
here.

All 29 checks passed:

- both hosted sessions resolved to their own verified identities
- a hosted paper order settled and replay returned the original result
- the hosted book reconciled after settlement
- each user could read only their own book, ledger, orders, fills and events
- `paper_intents` was not browser-readable
- browser tokens could not write ledger rows, alter balances or call the commit RPC
- concurrent commits admitted exactly one writer
- unreconciled cash was rejected by the database
- throwaway users were deleted with their books and email verification was restored

This validates the current linked project's two-user isolation path. It does
not certify the worker with the browser closed, silent token refresh, final
hosted readback or runtime cutover. The local profile remains the default.
