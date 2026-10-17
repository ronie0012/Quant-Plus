# Quant Plus local startup guide

This guide starts the Quant Plus frontend and the agent backend locally.

## Prerequisites

- Windows PowerShell
- Node.js and npm
- Python 3.11 or newer
- CodeCraft model credentials for the prediction agent
- Fyers credentials if you need live broker quotes or paper order execution

The repositories are expected at:

- Frontend: `D:\Quant-Plus`
- Backend: `D:\QP\agent-service`

## First-time setup

### 1. Configure the frontend

From the frontend directory, install dependencies:

```powershell
cd D:\Quant-Plus
npm install
```

Create `.env.local` only if it does not already exist:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

The terminal opens with a single local profile. No Supabase setup or login is
required. Paper data persists in `.local-data/workspace.json`, which is ignored
by Git and survives frontend restarts. Run one frontend server instance and use
`localhost` or `127.0.0.1` to access it.

Set the agent connection values:

```dotenv
AGENT_SERVICE_URL=http://127.0.0.1:8000
AGENT_SERVICE_API_KEY=use-the-same-value-as-backend-WEBSITE_API_KEY
```

Paper orders use this local store and server-fetched Fyers prices. Add virtual
funds through the wallet before placing an order. InsForge is now the selected
Supabase replacement, and the workspace is linked to the Quant-Plus project.
The local store remains active while hosted cutover checks are pending. InsForge
auth, the trading schema and owner migration tooling are implemented. Settings →
Account setup supports email verification and a read-only check of the imported
portfolio through your signed-in account. See [INSFORGE_MIGRATION.md](INSFORGE_MIGRATION.md).

Configure the server-only Quant AI chatbot in `.env.local`:

```dotenv
OPENROUTER_API_KEY=your-openrouter-key
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_CHAT_MODEL=nvidia/nemotron-3-ultra-550b-a55b:free
```

The chatbot uses NVIDIA Nemotron 3 Ultra through OpenRouter. The agentic stock
prediction graph continues to use its existing CodeCraft gateway. Do not place
the OpenRouter key in a `VITE_*` variable.

Do not commit `.env.local` or any value prefixed with `VITE_` that contains a secret.

### 2. Configure the backend

Create and activate a virtual environment, then install the backend dependencies:

```powershell
cd D:\QP\agent-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.lock.txt
python -m pip check
```

Create the backend environment file:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Set the following in `D:\QP\agent-service\.env`:

- One or more `CODECRAFT_KEY_*` values, plus `CODECRAFT_BASE_URL` if it differs from the example.
- `ANALYST_MODEL` and `DECIDER_MODEL` as required by your deployment.
- `WEBSITE_API_KEY`, using exactly the same value as the frontend `AGENT_SERVICE_API_KEY`.
- `FYERS_*` credentials if live quotes or paper order execution are required.
- `FRONTEND_ORIGINS=http://localhost:5173,http://127.0.0.1:5173` when using the default Vite port.

Backend secrets belong in this file, never in frontend `VITE_*` variables. Keep `.env` private.

The validated environment on this machine is already at
`D:\Quant-Plus\.local-data\backend-runtime`. You can invoke its interpreter
directly without activation. If PowerShell blocks activation of a newly created
environment for the current terminal, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Start the application

Use two PowerShell terminals.

### Terminal 1: agent backend

```powershell
cd D:\QP\agent-service
& D:\Quant-Plus\.local-data\backend-runtime\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Check that it is running at:

- Health endpoint: `http://127.0.0.1:8000/api/v1/health`
- API documentation: `http://127.0.0.1:8000/docs` (requires the internal API-key header).

Keep one backend worker for local development because the prediction cache, warming jobs, and market feed state are process-local.

### Terminal 2: frontend

```powershell
cd D:\Quant-Plus
npm run dev
```

Open the URL printed by Vite (the project commonly uses port `8080`). The local
workspace opens without a login. Use the printed port to open a stock page such as:

- `http://localhost:5173/app/stocks/HDFCBANK`
- `http://localhost:5173/app/stocks/RELIANCE`

Restart Vite after changing `.env.local`; Vite reads environment variables when it starts.
Restart the backend after source/configuration updates as well. Do not start a
second process on an occupied port. New machines can use the `.venv` interpreter
created above instead of this machine's existing `backend-runtime` interpreter.

## Optional: connect Fyers

With the backend virtual environment active and the backend configuration complete:

```powershell
cd D:\QP\agent-service
.\.venv\Scripts\Activate.ps1
python scripts/connect_fyers.py --open
```

Complete the Fyers login and two-factor flow. The refresh token is stored in the ignored `data/fyers_private/tokens.json` path. Never commit that file or broker credentials.

Without Fyers, the application can use delayed/research data where supported, but live quotes and paper order execution are unavailable.

## Verify the installation

Frontend checks:

```powershell
cd D:\Quant-Plus
npm run typecheck
npm test
npm run lint
npm run build
```

Backend checks:

```powershell
cd D:\QP\agent-service
.\.venv\Scripts\Activate.ps1
python -m pytest -q
```

The complete backend test suite may take several minutes.

## Troubleshooting

- **`401 Invalid website API key`**: make sure `AGENT_SERVICE_API_KEY` and `WEBSITE_API_KEY` match exactly, then restart both processes.
- **`503 Agent model credentials not configured`**: add valid `CODECRAFT_KEY_*` values to the backend `.env` and restart the backend.
- **Frontend cannot reach the agent**: confirm the backend is listening on `127.0.0.1:8000`, check `AGENT_SERVICE_URL`, and restart Vite.
- **Fyers login is required**: run `connect_fyers.py --open` again; tokens can expire or be revoked.
- **The first prediction is slower**: a new symbol may require research and model analysis. Warmed or cached analyses return faster while retaining the full analysis pipeline.

## Secret handling

Never commit `.env`, `.env.local`, API keys, model credentials, Fyers tokens, or broker secrets. Use paper trading while validating the system and review every order before enabling broker execution.
