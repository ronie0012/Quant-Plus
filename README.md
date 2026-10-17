# Quant Plus

An NSE market research and paper trading terminal with provider quotes,
historical charts, independent research agents, virtual holdings and an AI copilot.

This project was built with [Lovable](https://lovable.dev).

For the detailed idea, architecture, features, data pipelines and measured results,
read [the project presentation](PROJECT_PRESENTATION.md).

InsForge is the selected replacement for the historical Supabase integration.
The workspace is linked to the Quant-Plus InsForge project. Server auth, hosted
paper-book persistence and owner migration tooling are implemented; the local
store remains active while hosted cutover validation is pending.
See [INSFORGE_MIGRATION.md](INSFORGE_MIGRATION.md) for the integration sequence.
Current verified changes and remaining roadmap gates are in
[ROADMAP_IMPLEMENTATION_20261015.md](ROADMAP_IMPLEMENTATION_20261015.md).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/785a8b5d-32b1-4db6-ac68-49f2ab2bb027).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Use Node.js 22.14 or newer and npm. If `.env.local` is absent, copy `.env.example` to `.env.local`
and configure the agent service settings. The app uses a single local profile;
wallet, orders, holdings, watchlists, alerts, journal and preferences persist in
`.local-data/workspace.json` (ignored by Git). No Supabase account, keys or
database migrations are needed for local use. Run one frontend server instance
and open it through `localhost` or `127.0.0.1`. Keep server credentials
out of `VITE_*` variables. See [AGENT_INTEGRATION.md](AGENT_INTEGRATION.md)
for integration details, and [STARTUP.md](STARTUP.md) for the local startup commands.

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Run the local checks before deployment:

```sh
npm run typecheck
npm test
npm run lint
npm run build
```

To run the built app locally, use `npm run preview` and open
`http://127.0.0.1:3000`. This starts the Node server and loads `.env.local`.

Paper orders use virtual funds. The stock board and stock pages use provider
quotes; other dashboard widgets may contain labelled demonstrative data.
Committee and Agent Activity show actual persisted research sessions.
The AI chat receives your question, recent conversation and authenticated live
context when available, with source and freshness labels.

Quant AI chat is now server-side OpenRouter Nemotron (`nvidia/nemotron-3-ultra-550b-a55b:free`)
with authenticated provider context. The CodeCraft-backed agentic stock research system remains
separate and continues to produce research-only stock predictions. Quant Plus is paper-trading only.
