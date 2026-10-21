# Running SignalMaster Pro on Windows

Two ways to run it. Option A needs Node.js; option B needs nothing at all.

## Prerequisites (Option A only)

| Tool | Version | Check | Where |
| --- | --- | --- | --- |
| Node.js | 18.18+ (20 LTS recommended) | `node -v` | https://nodejs.org (LTS installer) |
| npm | 9+ (ships with Node) | `npm -v` | — |
| Python | 3.11+ — **optional**, only for the symbolic engine | `python --version` | https://python.org |

You do **not** need Git, Docker, a database, or any paid service.

---

## Option A — full app with the dev server

Open **PowerShell** in the folder where you unzipped (or use `cmd`; commands are the same except the venv
activation line).

```powershell
# 1. go to the frontend
cd signalmaster-pro\frontend

# 2. install dependencies (once; ~30 s, needs internet)
npm ci

# 3. start the app
npm run dev
```

Open **http://localhost:5173** in your browser. Stop the server with `Ctrl + C`.

Production build instead of the dev server:

```powershell
npm run build      # type-checks and writes frontend\dist
npm run preview    # serves the build at http://localhost:4173
```

### Optional: the symbolic engine (SymPy)

Needed only for the symbolic Laplace/Z panels. Everything else works without it.

```powershell
# in a SECOND terminal
cd signalmaster-pro\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1        # PowerShell
# .\.venv\Scripts\activate.bat      # if you use cmd.exe instead
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

If PowerShell refuses to activate the environment, run once in that window:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

The app talks to it through its `/api` proxy, so no CORS setup is needed. The sidebar shows
**Engine online**. Health check: http://localhost:8000/api/health

### Optional: run the tests

```powershell
cd signalmaster-pro\frontend
npm test                    # 104 unit + component tests
npm run typecheck
npm run lint

npx playwright install chromium     # once, downloads a browser (~150 MB)
npx playwright test                 # 38 end-to-end tests, desktop + mobile

cd ..\backend
pip install -r requirements-dev.txt
python -m pytest -q                 # 36 API/security tests
```

---

## Option B — no install at all (single HTML file)

If `SignalMaster-Pro.html` is included in the archive, just **double-click it**. Everything is inlined (scripts,
styles, fonts, charts) and it runs offline in any modern browser. Saving experiments works in Chrome/Edge; some
browsers block storage for local files, in which case the app says so and disables saving. The symbolic engine
is not available in this mode.

To build that file yourself: `cd frontend && npm run build:standalone` → `frontend\dist-standalone\index.html`.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `npm` is not recognised | Install Node.js LTS and reopen the terminal (PATH is only picked up by new shells). |
| `EBADENGINE` / unsupported Node | You are on an old Node. Install 20 LTS. |
| `EPERM` / `EACCES` during `npm ci` | Do not unzip into `C:\Program Files` or OneDrive-synced folders; use e.g. `C:\dev\signalmaster-pro`. |
| Port 5173 already in use | Close the other process, or run `npm run dev -- --port 5174`. |
| Port 8000 already in use | `uvicorn app.main:app --port 8001`, then update the proxy target in `frontend\vite.config.ts`. |
| Browser shows "Engine offline" | Expected if the backend is not running. The numeric modules are unaffected. |
| `python` opens the Microsoft Store | Install Python from python.org and tick "Add python.exe to PATH". |
| PowerShell blocks `.venv\Scripts\Activate.ps1` | Use `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, or `activate.bat` in `cmd`. |
| Windows Firewall prompt | You only need local access; "Allow on private networks" is enough. |

Full documentation: `README.md`, `docs\troubleshooting.md`, `docs\deployment.md`.
