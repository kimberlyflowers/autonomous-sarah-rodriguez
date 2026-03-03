# BLOOM Bloomie Architecture — How We Built a Working Autonomous AI Agent

**Status:** Production — Dashboard actively upgraded to Bloomie reference UI
**Version:** 2.1.0
**Agent:** Sarah Rodriguez — AI Influencer / Operator for Petal Core Beauty
**Repo:** `autonomous-sarah-rodriguez` (kimberlyflowers/autonomous-sarah-rodriguez)
**Last Updated:** March 3, 2026

---

## What "Working" Means

This documents the first version where all three core capabilities confirmed functional simultaneously:

1. ✅ Sarah receives a message in her dashboard and responds with real AI-generated text
2. ✅ Sarah can call tools (GHL, email, etc.) and execute them successfully
3. ✅ Chat sessions persist in the sidebar across page loads

This is the baseline. Everything built next layers on top of this.

---

## Tech Stack

### Runtime
- **Node.js 18+** — ES Modules (`"type": "module"` in package.json)
- **Express 4** — HTTP server, REST API, serves built React dashboard

### AI Brain
- **Anthropic Claude API** (`@anthropic-ai/sdk ^0.27.0`)
- Model: `claude-haiku-4-5-20251001` (configurable via `ANTHROPIC_MODEL` env var)
- Tool calling via Anthropic's native tool use API (not a wrapper)
- 60+ tools registered and available to Sarah in a single chat request

### Database
- **PostgreSQL via Railway** (`pg ^8.11.3`)
- NOT Supabase — Railway's native Postgres addon (`bloom_heartbeat` database)
- Auto-setup on startup: `src/database/auto-setup.js` creates tables if they don't exist
- Key tables: `chat_sessions`, `chat_messages`, `agent_context`, `tool_executions`

### Integrations
- **GoHighLevel (GHL)** — CRM, contacts, conversations, tasks, calendar
  - v2 API endpoints with Location API key (not Agency key)
  - Two GHL client files: `src/integrations/ghl.js` + `src/tools/ghl-tools.js`
- **Email** — Nodemailer (`nodemailer ^6.9.8`)
- **Browser Automation** — Playwright (`playwright ^1.41.0`)
- **Document Parsing** — Mammoth (`mammoth ^1.11.0`) for .docx files

### Dashboard (Frontend)
- **React 18** built with Vite 4
- Single-file component: `dashboard/src/App.jsx` (~1490 lines as of March 3)
- Served as static files by Express from `dashboard/dist/`
- Designed by merging Jaden's client-facing Bloomie UI with Sarah's operator panel
- Real-time updates via SSE (Server-Sent Events) at `/api/events/stream`

### Infrastructure
- **Railway** — Deployment platform
- Build: nixpacks (auto-detects Node.js)
- **⚠️ CRITICAL:** Railway has no root `package.json` — it CANNOT build the dashboard
- The `dashboard/dist/` folder MUST be committed with every source change
- Start: `node src/index.js`
- Health check: `GET /health` — always returns 200, Railway monitors this
- Restart policy: always (auto-restarts on crash)

### Memory / Long-term Context
- **Letta** — Long-term memory server (`letta-server/` subdirectory)
- Currently unreachable (`letta-server.railway.internal` ENOTFOUND) — not blocking
- Short-term: conversation history stored in Railway Postgres per session
- Context compression runs via cron to manage token limits

### Scheduling
- **node-cron** (`node-cron ^3.0.3`) — autonomous background tasks
- Heartbeat runs on a schedule to keep Sarah active even with no user interaction
- Cron frequencies reduced to prevent 529 rate limit errors

### Logging
- **Winston** (`winston ^3.11.0`) — structured logging throughout

---

## Repository Structure

```
autonomous-sarah-rodriguez/
├── heartbeat-engine/           # Main application
│   ├── src/
│   │   ├── index.js            # Entry point — Express server + cron init
│   │   ├── heartbeat.js        # Autonomous background thinking loop
│   │   ├── agent/
│   │   │   ├── think.js        # Core reasoning loop — calls Claude API
│   │   │   └── ...
│   │   ├── api/
│   │   │   ├── chat.js         # POST /api/chat/message — main chat endpoint
│   │   │   ├── dashboard.js    # Dashboard data APIs
│   │   │   ├── events.js       # GET /api/events/stream — SSE endpoint
│   │   │   ├── execute.js      # Direct tool execution endpoint
│   │   │   └── browser.js      # Browser automation API
│   │   ├── config/
│   │   │   ├── agent-profile.js    # Sarah's identity, persona, capabilities
│   │   │   └── cron-schedules.js   # Heartbeat timing config
│   │   ├── context/
│   │   │   └── context-manager.js  # Conversation context handling
│   │   ├── database/
│   │   │   └── auto-setup.js   # DB connection pool + schema auto-migration
│   │   ├── integrations/
│   │   │   ├── ghl.js          # GHL API client (v2 endpoints)
│   │   │   └── email.js        # Email sending via Nodemailer
│   │   ├── logging/
│   │   │   └── logger.js       # Winston logger factory
│   │   ├── memory/
│   │   │   └── letta-client.js # Letta long-term memory client
│   │   ├── monitoring/
│   │   │   └── system-monitor.js   # Health metrics, memory usage tracking
│   │   ├── tools/
│   │   │   ├── enhanced-executor.js    # Tool execution orchestrator
│   │   │   ├── ghl-tools.js            # 60+ GHL tools registered for Claude
│   │   │   └── internal-tools.js       # Internal BLOOM tools
│   │   └── trust/
│   │       └── trust-gate.js   # Autonomy level enforcement (Levels 1-5)
│   ├── dashboard/              # React frontend
│   │   ├── src/
│   │   │   └── App.jsx         # Single-file React app (~1490 lines)
│   │   ├── dist/               # ⚠️ Built output — MUST be committed
│   │   └── package.json
│   ├── package.json
│   ├── SYSTEM_ARCHITECTURE.md  # Technical deep-dive doc
│   ├── soul.md                 # Sarah's persona/values
│   └── railway.toml            # Railway deployment config
├── letta-server/               # Long-term memory server (currently offline)
├── SESSION_NOTES.md            # Rolling session log
└── railway.toml                # Root deployment config
```

---

## How a Chat Message Flows

```
User types message in React dashboard
    ↓
POST /api/chat/message  { message, sessionId }
    ↓
chat.js: Load conversation history from DB (chat_messages)
    ↓
chat.js: Build messages array with full context
    ↓
Anthropic API call with:
  - System prompt (Sarah's persona/instructions)
  - Conversation history
  - All 60+ tool definitions
    ↓
Claude responds (may call tools)
    ↓
If tool call: enhanced-executor.js routes to correct tool
  → ghl-tools.js → integrations/ghl.js → GHL API
  → internal-tools.js → internal operations
    ↓
Tool result fed back to Claude (agentic loop, up to 10 turns)
    ↓
Final text response returned
    ↓
Save to DB: chat_sessions + chat_messages tables
Auto-generate session title (separate Claude call)
    ↓
{ response: "Sarah's reply" } → Frontend
    ↓
React renders message, fetchSessions() updates sidebar (polls every 8s)
```

---

## Dashboard UI — Current State (March 3, 2026)

### ⚠️ Deploy Protocol — NEVER SKIP THIS
```bash
# After any App.jsx change:
cd heartbeat-engine/dashboard && rm -rf dist && npm run build
cd ../..
git add heartbeat-engine/dashboard/src/App.jsx heartbeat-engine/dashboard/dist/
git commit -m "..." && git push
```
Railway cannot build the dashboard itself. If you push source without dist/, users get a white screen.

### Navigation
| Tab | Key | What It Does |
|-----|-----|--------------|
| 💬 Chat | `chat` | Primary interface, persistent sessions, AI titles |
| 📊 Status | `monitor` | System health, component checks, auto-healing |
| 📁 Files | `artifacts` | Documents & deliverables Sarah has created |
| ⏰ Jobs | `cron` | Cron/automation schedule management |
| ⚙️ Settings | (via Kimberly menu) | Moved out of top nav |

### Left Sidebar
- **Project/Business switcher** — Petal Core Beauty / Youth Empowerment School / BLOOM Internal
- **Session list** — AI-generated titles, timestamps, delete option
- **Agent identity card** — Sarah Rodriguez, Online indicator
- **Autopilot status pill** — green pulse + "All OK"
- **Kimberly/Owner expandable menu** — opens upward: Settings, Developer Mode, Light/Dark toggle, Log out

### Right Panel (Chat view)
- Resizable browser/screen view (LIVE Chromium label)
- **ActiveTaskTracker** below browser — step list with ✓ checkmarks, "Working now" pulse
- **ProgressRing** SVG component — circular % display

### Chat
- Full message history from PostgreSQL
- File upload with previews (images shown inline, docs as chips)
- Loading dots animation while Sarah responds
- SSE real-time connection status in header

### 🔲 Still To Build (next session)
1. **Inline task completion cards** — green "✅ Task completed — [name]" card inside chat messages
2. **Email draft approval cards** — "📧 Subject — Ready for review" + "Review & Approve" button
3. **Autopilot job count** — wire to real cron jobs count
4. **Model selector** dropdown in chat header (Auto ▾)
5. **Mobile layout** optimization
6. **Suppress false "critical"** on cold start (tool_performance: 0 executions = 0% rate)

### Next Session Starting Point
Inline chat cards. Find message render block ~line 1192 in App.jsx, inside `messages.map()`.
Messages are plain text from DB. Detect patterns in Sarah's response text:
- "Task completed" / "✅" + tool/name → render green task card below bubble
- "drafted" / "email" / "Subject:" → render email draft card with Review & Approve button
Build `parseMessageCards(text)` helper above the App export, call it in the render loop.

---

## Critical Environment Variables

```bash
# AI
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Database (Railway auto-injects)
DATABASE_URL=postgresql://...

# GoHighLevel
GHL_API_KEY=                    # Location API key (v2) — 40 chars
GHL_LOCATION_ID=iGy4nrpDVU0W1jAvseL3

# Agent Identity
AGENT_ID=bloomie-sarah-rodriguez
AGENT_NAME=Sarah Rodriguez
AGENT_ROLE=ai-influencer

# Email (optional — uses fallback if not set)
SMTP_HOST=
SMTP_USER=
SMTP_PASS=

# Letta (long-term memory — currently offline, not blocking)
LETTA_URL=
LETTA_AGENT_ID=
```

---

## Bug History — Every Critical Fix

### Fixed Before March 3
**1. Import Path Mismatch (ERR_MODULE_NOT_FOUND)**
- Symptom: Chat shows dots, never responds
- Cause: `chat.js` had `../../database/auto-setup.js` → resolves wrong in container
- Fix: `../database/auto-setup.js`

**2. Trust Gate Blocking All Tools**
- Symptom: Sarah responds but never executes tools
- Cause: Default autonomy level set too high — all GHL writes blocked
- Fix: Restructured levels so Level 1 = standard assistant ops; Level 4-5 = irreversible only

**3. Only 7 GHL Tools Registered (Should Be 60+)**
- Cause: `chat.js` had hardcoded short tool list, never synced with `ghl-tools.js`
- Fix: Centralized all tool definitions in `ghl-tools.js`, imported from there

**4. GHL API v2 Endpoints with v1 Auth**
- Symptom: All GHL operations → 401 Unauthorized
- Fix: Location API key + Bearer token, all endpoints updated to v2 paths

**5. Missing `createPool` Export**
- Symptom: `chat.js` import fails at startup
- Fix: Added `createPool` export to `auto-setup.js`

**6. Chat Sessions Not Appearing in Sidebar**
- Cause: `chat_sessions` table schema mismatch; migration logic missing
- Fix: Added `ALTER TABLE` migration in `auto-setup.js`

**7. 529 Rate Limit Cascades**
- Cause: Cron + chat + autonomous actions hitting Anthropic API simultaneously
- Fix: Exponential backoff retry (3 attempts, 1s/2s/4s), reduced cron frequency

### Fixed March 3, 2026
**8. Import path regression (same as #1, reintroduced)**
- Commit: `993dca9` — `../database/auto-setup.js` in chat.js

**9. `btm` useRef accidentally deleted → white screen**
- Cause: When rewriting state block to add files useEffect, `const btm=useRef(null)` was dropped
- `btm.current` used in scroll-to-bottom effect (line ~890) and as `<div ref={btm}/>` in chat
- Crash: `btm is not defined` at runtime → React error boundary → white screen
- Commit: `b3b4865`
- Lesson: When doing str_replace on large blocks, always grep for all usages of deleted variables first

**10. dist/ not committed → Railway serves stale/empty dashboard**
- Cause: Pushed source changes without rebuilding and committing dist/
- Railway's nixpacks build: `npm ci` → `npm run dashboard:install` → `npm run build` — BUT this runs from repo root which has no package.json, so build silently fails
- Fix: Always commit dist/ as part of the same push as source changes
- Commit: `2072db9`

---

## Known Non-Critical Issues (Not Blocking)

- `tool_performance` health check fires "critical" every cold start — 0 executions = 0% success rate, auto-heals itself in ~30s, safe to ignore
- Letta memory server unreachable — agent uses DB-only memory, fully functional
- `MaxListenersExceededWarning` — cosmetic, 11 listeners vs 10 max, no impact
- Email not fully configured — uses fallback methods, GHL messaging still works

---

## How to Deploy a New Bloomie Using This Architecture

1. **Fork/copy the repo** — `autonomous-sarah-rodriguez` is the template
2. **Update agent identity** in `src/config/agent-profile.js` — name, role, persona, instructions
3. **Set environment variables** in Railway (see list above)
4. **Connect Railway Postgres** — add the Postgres addon, `DATABASE_URL` auto-injects
5. **Deploy** — Railway picks up `railway.toml`, nixpacks handles the rest
6. **Verify:** Hit `/health` endpoint — should return `{"status":"healthy"}`
7. **Test chat:** Open dashboard URL, send a message, wait for response (10-30s first time)

---

## The Dashboard Design Origin

The current dashboard is a merge of two previous dashboards:
- **Jaden's client-facing Bloomie UI** — visual design, branding, chat interface (originally 1524-line `BloomieDashboard.jsx`)
- **Sarah's operator panel** — SSE real-time feeds, cron job management, system health, tool execution logs

The merged version (`App.jsx`) uses Jaden's visual shell with Sarah's backend connectivity, and is actively being upgraded to match the full Bloomie reference UI (screenshot reference: March 3, 2026 session).

---

*Last updated: March 3, 2026 — BLOOM Engineering*
