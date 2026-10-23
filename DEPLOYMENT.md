# Deploying Quant Plus on InsForge

Status (2026-10-20): **prepared, not deployed.** The app runs locally in hosted
InsForge mode (InsForge sign-in and the hosted paper book). Nothing below has
been run against the cloud yet. Run it when you are ready to publish; the
commands create billable compute.

## Architecture

| Service | Source | Where | Why |
| --- | --- | --- | --- |
| Web app (SSR + paper worker) | `D:\Quant-Plus` (`Dockerfile`) | InsForge compute | The worker settles resting orders and protections with no browser open, so it must be a long-lived process, not serverless. |
| Agent service (market data, Fyers feed, AI) | `D:\QP\agent-service` (`Dockerfile`) | InsForge compute | Holds the Fyers WebSocket and research jobs in one process. |
| Database, auth, paper book | InsForge project `Quant-Plus` | Already live | Owner-scoped RLS; the book commits through `paper_commit_book`. |

Region: use Fly's Mumbai region (`bom`) for both services to keep latency to
NSE and to each other low.

## Before you deploy

1. Docker images: `docker build .` in each repository should succeed. This was
   not verified in the preparation run (the Docker engine was not running).
2. Install `flyctl` (InsForge source-mode deploys use it for the remote build;
   no local Docker daemon is needed for the deploy itself).
3. Fyers: add the deployed web URL to the Fyers app's redirect URLs. Each
   container restart clears the Fyers token (compute has no persistent volume),
   so sign in to Fyers again after a restart.
4. Compute has no persistent disk. The hosted paper book is in InsForge Postgres
   and is unaffected; the agent service's SQLite research cache and the web
   app's last-known market cache rebuild after a restart.

## 1. Agent service

Create `D:\QP\agent-service\.env.production` (never commit it) with the backend
secrets from `.env`: `CODECRAFT_KEY_*`, `CODECRAFT_BASE_URL`, `ANALYST_MODEL`,
`DECIDER_MODEL`, `WEBSITE_API_KEY`, `FYERS_*`, and
`FRONTEND_ORIGINS=https://<web-app-domain>`.

```powershell
cd D:\Quant-Plus
npx -y @insforge/cli compute deploy D:\QP\agent-service --name quantplus-agent `
  --port 8000 --memory 1024 --region bom --env-file D:\QP\agent-service\.env.production
```

Note the service URL it prints.

## 2. Web app

Public browser values are compiled into the build. Create
`D:\Quant-Plus\.env.production.local` containing **only** public values:

```dotenv
VITE_QUANT_PLUS_AUTH=insforge
VITE_INSFORGE_URL=https://htaen3qu.us-east.insforge.app
VITE_INSFORGE_ANON_KEY=<public anon key>
# optional analytics: npx -y @insforge/cli posthog setup
VITE_POSTHOG_KEY=<phc_ key>
```

Create a separate runtime secrets file, e.g. `D:\Quant-Plus\.local-data\web.production.env`
(inside the ignored folder), with server-only values:

```dotenv
QUANT_PLUS_BOOK_PROVIDER=insforge
INSFORGE_URL=https://htaen3qu.us-east.insforge.app
INSFORGE_API_KEY=<admin key — server only>
INSFORGE_ANON_KEY=<public anon key>
AGENT_SERVICE_URL=<agent service URL from step 1>
AGENT_SERVICE_API_KEY=<same as WEBSITE_API_KEY>
OPENROUTER_API_KEY=<key>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_CHAT_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
```

```powershell
cd D:\Quant-Plus
npx -y @insforge/cli compute deploy . --name quantplus-web --port 3000 `
  --memory 1024 --region bom --env-file .local-data\web.production.env
```

Then in InsForge auth settings, add the web URL to the allowed redirect URLs
(`npx -y @insforge/cli config` — see the insforge-cli skill).

## 3. Verify

- `/` loads; `/app/dashboard` redirects to sign-in; sign in with the migration
  owner email and confirm cash ₹9,92,910.50 and 10 HDFCBANK.
- `/api/local` without a session returns 401.
- With Fyers signed in, a stock page shows "Live" and the index strip ticks.
- Run the worker check below.

## Still open before inviting other users

- **Worker-closed-browser check** (from `INSFORGE_MIGRATION.md`): with a
  throwaway account, place a resting LIMIT order during market hours, close
  every browser tab, and confirm the server fills it at the limit. Needs live
  Fyers quotes; not yet run.
- Custom domain: `npx -y @insforge/cli domains ...`.

## Rollback

- Web app: `npx -y @insforge/cli compute stop <service-id>`.
- Local hosted mode: remove `QUANT_PLUS_BOOK_PROVIDER` and `VITE_QUANT_PLUS_AUTH`
  from `.env.local` and restart. The local book is frozen at the 2026-10-20
  cutover state; any hosted trades after that would need reconciling first
  (`node scripts/compare-hosted-book.mjs` shows the difference).
