# InsForge integration status and migration sequence

Decision recorded 2026-10-14: use **InsForge wherever Supabase was previously planned or used**.

## Verified connection

- Project: Quant-Plus.
- Project ID: `ae254327-702a-47d6-a142-b1163ae5aa32`.
- API base: `https://htaen3qu.us-east.insforge.app`.
- [Project dashboard](https://insforge.dev/dashboard/project/ae254327-702a-47d6-a142-b1163ae5aa32).
- CLI link completed and an authenticated database inspection succeeded.
- At the initial link, `db tables --json` returned `[]`. The paper-book migrations
  were subsequently applied; this is no longer an empty project.
- `.insforge/project.json` is ignored by Git. It contains admin credentials; do not commit it.

The app has not been deployed. Linking does not create the trading schema, change application
authentication, or move local account data. Current runtime remains the single local profile and
`.local-data/workspace.json` until the implementation gates below pass. The linked project is a
hosted backend; a locally running frontend can use it after integration.

## Replacement map

| Current or historical dependency                         | InsForge target                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Supabase JS SDK, session types and local client cast     | `@insforge/sdk` plus app-owned session/repository types                                         |
| Browser sign-in/sign-up/OAuth and session subscription   | InsForge auth; explicitly adapt lifecycle/refresh behavior to TanStack Start                    |
| Supabase server auth checks in chat/agent/paper routes   | Verify InsForge user sessions; maintain local mode only as an explicit supported mode           |
| Accounts, holdings, orders and wallet transactions       | InsForge PostgreSQL with server-owned atomic settlement and grants/RLS                          |
| Watchlists, alerts, journal, risk limits and preferences | User-scoped InsForge tables and validated repository methods                                    |
| `SUPABASE_SERVICE_ROLE_KEY` / historical privileged RPCs | Server-only InsForge admin client, with carefully restricted runtime/SQL privileges             |
| Optional Supabase sentiment-history repository           | InsForge-backed history repository behind the existing protocol                                 |
| Future documents, exports and attachments                | InsForge storage where appropriate; preserve returned object URL and key                        |
| Account events / UI invalidation                         | InsForge realtime with explicit channel authorization                                           |
| Historical Supabase SQL and seed data                    | Reviewed InsForge migrations; do not blindly import seeds or Supabase-specific role assumptions |

Supabase and InsForge method names, response shapes, auth lifecycle and privileged roles are not
identical. Use the installed InsForge skills and actual SDK types rather than renaming imports or
relying on an unsafe compatibility cast. Official SDK entry points distinguish public/user clients
from server admin clients. [InsForge SDK](https://github.com/InsForge/InsForge-sdk-js).

## Implementation sequence within roadmap Phase 2

1. Keep the audit's Phase 1 financial/time integrity fixes as blockers. A provider migration
   must not merely reproduce known incorrect execution and calibration behavior elsewhere.
2. Inspect auth configuration and actual PostgreSQL roles/functions on the linked backend.
   Create a backend branch for schema/RLS/auth changes using the installed skill workflow.
3. Add versioned application migrations in `public`: accounts, funding/ledger, orders/fills,
   holdings/lots, intents/idempotency, reservations, risk, alerts, journal, preferences, watchlists
   and durable jobs. Preserve exact monetary precision and state-transition constraints.
4. Define a single trusted paper-book service owner. Validate prices/risk server-side and settle
   cash/positions/fees/events in one transaction. Never allow the browser to update balances,
   inject fill prices or impersonate another user through an admin key.
5. Enable owner-scoped RLS and precise SQL grants. Inspect default privileges; admin-only CLI
   reads do not verify ordinary user security. Current docs use `auth.users(id)` / `auth.uid()`
   and a `project_admin` role, so historical Supabase `service_role` grants need review.
   [InsForge access control](https://github.com/InsForge/insforge-skills/blob/main/skills/insforge-cli/references/database/access-control.md).
6. Implement InsForge auth and typed app repositories. Adapt the local auth page, app guard,
   session hook, agent proxy, chat context and order/funding boundaries together. Keep the
   existing CodeCraft research and OpenRouter chatbot model choices unchanged by this migration.
7. Configure app credentials through ignored server/client environment files. Only an explicitly
   public anon key can be exposed to the browser; the project's admin API key stays server-only.
   Do not copy all fields from `.insforge/project.json` into `VITE_*` variables.
8. If the local paper file contains user data, back it up and reconcile it before any transfer.
   CLI account login is not an application-user identity. Map the local profile to a verified
   InsForge app user explicitly; do not insert the constant local profile into managed auth tables.
9. Test two-user isolation, unauthenticated denials, admin-key isolation, funding/trading atomicity,
   duplicate intents, cancel/fill races, precision, restart recovery and provider failure behavior.
   Use isolated branch/test records and preserve the existing local account.
10. Cut over the data provider only after those checks pass. Remove Supabase SDK/imports/env
    lookups and inactive auth helpers; mark historical SQL/docs as historical. Reconcile the
    provider-dependent tests and update the audit status rather than claiming the old tests prove
    InsForge behavior. Keep a documented rollback path during the migration.

No application tables, users, migrations or deployed functions were created by the link operation.

## Progress (updated 2026-10-15)

- Steps 3–5 done: migrations `20261014130103_create-paper-book` and `20261014130652_single-book-authority`
  are applied to the linked project (no branch was used: the project was empty, the change is additive
  and branches cost a separate instance). Owner-only SELECT RLS; no runtime-role writes; the single
  write path is the admin-only `paper_commit_book` compare-and-swap. Anonymous access was verified as
  denied over REST.
- Step 6 largely done: `src/lib/insforge-book.server.ts`, `book-service.server.ts`,
  `request-auth.server.ts`, browser sign-in through `@insforge/sdk` behind `VITE_QUANT_PLUS_AUTH=insforge`.
- Step 7 done: `.env.example` documents server-only `INSFORGE_API_KEY` and the public anon key.
- Step 8: the explicitly selected, verified application user now owns a hosted
  copy of the local book. The one-shot import passed reconciliation and exact
  readback. The original local file and private backup are preserved. Import
  snapshot: cash ₹992,910.50, one holding, one order, one fill and two ledger entries.
  Owner selection and backup location remain in ignored `.local-data` files.
- Auth now uses server actions and HttpOnly refresh cookies, with email OTP,
  resend and reload recovery. In local Settings → Account setup, connect the
  verified account and select **Check imported portfolio**. This reads with the
  user's JWT under RLS, verifies owner/reconciliation, and performs no writes.
- Step 10 cleanup: unused Supabase SDK/auth adapters and backend configuration
  were removed; historical source is retained under `audit/implementation`.
- Still pending: fresh live two-user/worker checks and hosted runtime cutover.
  The old isolation harness changes project-wide email-verification settings;
  do not run it during real-account onboarding. The local book remains active.
  Any local writes after the import must be reconciled before cutover; the
  migration tool deliberately refuses to overwrite or merge an existing book.

## Hosted cutover hardening (2026-10-17)

- Hosted mode is now fail-closed when its browser or server credentials are only partially
  configured; it cannot silently fall back to the loopback profile.
- The built-server launcher forwards `INSFORGE_ANON_KEY`, and the hosted worker no longer
  mutates the preserved local book after hosted mode is selected. Hosted-book enumeration is
  paginated, loaded states are reconciled before use, and history-prefix changes are rejected.
- Local-only last-session practice controls are hidden for hosted users. The public auth flow
  persists pending email verification across reloads, preserves the provider-selected code/link
  method, and no longer advertises an unimplemented Google sign-in button.
- The linked project contains the explicitly selected verified migration owner and one imported,
  reconciled hosted book. This is an operator/readback fact, not a claim that the frontend has
  been cut over.

The activation flags remain unset in the ignored local environment until the fresh live
two-user/worker check and final hosted readback are approved. Do not enable hosted writes while
the local book is still changing; after the first hosted write, rollback requires reconciliation
of both histories.

Provider activation requires both `QUANT_PLUS_BOOK_PROVIDER=insforge` and
`VITE_QUANT_PLUS_AUTH=insforge`, followed by a frontend restart. Keep these flags
unset until the remaining checks pass. Rollback before hosted writes is to leave
them unset and continue using the preserved local book. After hosted writes,
rollback requires reconciling both histories; do not simply switch to a stale file.
