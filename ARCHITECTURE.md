# BLOOM Ecosystem — Architecture & Status

**Last updated:** March 5, 2026
**Repo:** autonomous-sarah-rodriguez
**Deploy:** Railway (Node.js + Python sidecar + Postgres + Letta)

---

## What BLOOM Is

BLOOM is an AI staffing agency that provides autonomous AI employees ("Bloomies") to businesses. Each Bloomie handles marketing, CRM, content creation, scheduling, and client communication. The platform is being built as a SaaS — one codebase, multi-tenant, with auth + Stripe billing.

**Pricing:** $500/mo (Standard) | $800/mo (Pro) | $1,200/mo (Enterprise)
**First client:** Bishop Charles Flowers / Youth Empowerment School (YES) — paying $500, getting $1,200 tier for beta testing.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   BLOOM Dashboard (React + Vite)         │
│  Chat | Status | Files | Activity | Calls | Skills      │
│  Profile | Settings | Billing                           │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────────────────┐
│             Heartbeat Engine (Node.js/Express)           │
│                                                         │
│  /api/chat ─────── Main chat pipeline (Claude API)      │
│  /api/files ────── Artifact storage + CRUD              │
│  /api/dashboard ── Status, metrics, user avatar          │
│  /api/agent ────── Agent profile management              │
│  /api/skills ───── BLOOM + Company Skills CRUD           │
│  /api/voice ────── Voice prompt generator for GHL        │
│  /api/execute ──── Agentic tool execution                │
│  /api/browser ──── Browser task proxy + streaming        │
│  /api/events ───── SSE event stream                      │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │ Orchestrator                                 │        │
│  │  router.js ── Tier-based model routing       │        │
│  │  task-executor.js ── Scheduled task runner   │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │ LLM Layer (unified-client.js)               │        │
│  │  Primary: Claude Haiku 4.5                   │        │
│  │  Failover: Claude → OpenAI → Gemini          │        │
│  │  Specialist dispatch per tier/task type      │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │ Skill System (skill-loader.js)              │        │
│  │  Progressive disclosure: metadata always in  │        │
│  │  prompt, full skill injected on task match   │        │
│  │  6 BLOOM Skills + unlimited Company Skills   │        │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │ Tools                                        │        │
│  │  ghl-tools.js ── CRM (contacts, pipeline,   │        │
│  │                   messages, appointments)     │        │
│  │  browser-tools.js ── Browser task dispatch   │        │
│  │  image-tools.js ── Image gen (Gemini/OpenAI) │        │
│  │  web-search-tools.js ── Web research         │        │
│  │  internal-tools.js ── System operations      │        │
│  └─────────────────────────────────────────────┘        │
└──────────────────┬──────────────────────────────────────┘
                   │
      ┌────────────┼────────────────────┐
      ▼            ▼                    ▼
┌──────────┐ ┌──────────────┐ ┌──────────────────┐
│ Postgres │ │ Letta Server │ │ Browser Sidecar  │
│ (Railway)│ │ (Railway)    │ │ (Python/FastAPI)  │
│          │ │              │ │                   │
│ Sessions │ │ Long-term    │ │ Self-hosted       │
│ Messages │ │ memory per   │ │ Browserless first │
│ Artifacts│ │ contact      │ │ → Cloud fallback  │
│ Calls    │ │              │ │ on Cloudflare     │
│ Settings │ │              │ │ block detection   │
└──────────┘ └──────────────┘ └──────────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │  GoHighLevel CRM │
         │  (Client's acct) │
         │                  │
         │  Contacts        │
         │  Pipeline        │
         │  Voice AI Agent  │
         │  Workflows       │
         │  Phone numbers   │
         └─────────────────┘
```

---

## What's Built & Working

### Core Chat Pipeline ✅
- Claude API integration with streaming tool use
- Session management with Postgres persistence
- Conversation history (40 message context window)
- System prompt with agent personality + skill catalog injection
- Task acknowledgment before working (frontend-generated)
- Smart working indicator (dots for chat, progress for tasks)

### Dashboard ✅
- Chat interface with session sidebar
- Status/Monitor page with operational cards
- Files & Deliverables page with preview modal (HTML iframe support)
- Activity log
- **📞 Calls tab** — phone call transcripts + Sarah's actions
- **🧠 Skills page** — BLOOM Skills (toggleable) + Company Skills (CRUD)
- Agent Profile page with avatar upload
- User (owner) avatar upload with DB persistence
- Settings page (General, Connection, Interface)
- Billing page with plan display + usage bars
- Owner menu (Billing, Skills, Settings)
- Collapsible right panel (Browser + Files tabs)
- Auto-open Files tab on artifact creation
- Dark/light theme support
- Mobile responsive

### Skill System ✅
- Progressive disclosure (metadata in prompt, full skill on task match)
- Keyword + task-type matching
- 6 BLOOM Skills (universal, ship with every Bloomie):
  - `blog-content.md` — SEO + emotional writing philosophy
  - `email-marketing.md` — HTML email technical + story-first approach
  - `social-media.md` — Platform specs + lead-with-person philosophy
  - `ghl-crm.md` — GHL API tool patterns + relationship philosophy
  - `professional-documents.md` — docx-js technical + data-plus-story
  - `website-landing-page.md` — Frontend design excellence + conversion
- Company Skills (custom per client, created in dashboard)
- Skills injected into specialist prompts on dispatch

### LLM Orchestration ✅ (framework built, keys needed)
- **Unified Client** (`unified-client.js`):
  - Silent failover chain: Claude → OpenAI → Gemini
  - Provider health tracking
  - Cost calculation per provider
  - Failover triggers: 429, 500, 502, 503, 529, timeouts
- **Router** (`router.js`):
  - Tier-based model selection (Standard/Pro/Enterprise)
  - Fast pattern-based task classification (no LLM call)
  - Specialist dispatch with skill injection
  - Auto-fallback if provider key missing

### Browser Automation ✅ (framework built, keys needed)
- Python/FastAPI sidecar (`browser-agent/main.py`)
- Smart fallback: self-hosted Browserless → Browser Use Cloud
- Cloudflare detection (2+ structural signatures required)
- Screenshot streaming to dashboard via SSE
- Browser tab in right panel with live/idle status

### GHL Integration ✅
- Contact search, create, update
- Send messages (SMS/email)
- Pipeline/opportunity management
- Appointment creation
- Workflow triggers
- Note creation

### Voice/Phone ✅ (backend built, GHL config needed)
- `/api/chat/ingest-call` — receives transcripts, routes through Sarah's real pipeline
- `/api/chat/calls` — returns call history for dashboard
- `/api/voice/prompt` — generates GHL Voice AI agent prompt + Custom Actions config
- Calls tab in dashboard with expandable transcript + Sarah's actions
- Per-contact phone sessions (same memory across calls)

### Image Generation ✅ (framework built, keys needed)
- Gemini Imagen 4.0 support
- Gemini 2.5 Flash image generation fallback
- OpenAI DALL-E support
- Tool integration in chat pipeline

---

## What Needs API Keys / Configuration

| Feature | Env Variable | Status | Notes |
|---------|-------------|--------|-------|
| Claude (primary LLM) | `ANTHROPIC_API_KEY` | ✅ Configured | Required — everything runs on this |
| GHL CRM | `GHL_API_KEY` + `GHL_LOCATION_ID` | ✅ Configured | Connected to YES account |
| Postgres | `DATABASE_URL` | ✅ Configured | Railway managed |
| Letta Memory | `LETTA_SERVER_URL` | ✅ Configured | Railway service |
| OpenAI (failover + specialist) | `OPENAI_API_KEY` | ❌ Not set | Enables: GPT-4o specialist, DALL-E images, failover chain |
| Gemini (failover + images) | `GEMINI_API_KEY` | ❌ Not set | Enables: emergency failover, Imagen 4.0, free tier available |
| DeepSeek (code specialist) | `DEEPSEEK_API_KEY` | ❌ Not set | Enables: code specialist for Pro/Enterprise |
| Browser Use Cloud | `BROWSER_USE_API_KEY` | ❌ Not set | Enables: cloud fallback for Cloudflare-blocked sites |
| Browserless (self-hosted) | `BROWSERLESS_WS_URL` | ⚠️ Check | Should point to Railway Browserless service |
| Dispatch system | `DISPATCH_ENABLED` | ❌ Not set | Set to `true` to enable multi-model specialist dispatch |
| Plan tier | `PLAN_TIER` | ❌ Not set | Set to `standard`, `pro`, or `enterprise` |

### Quick Setup for Full Feature Unlock:
```bash
# In Railway environment variables:
GEMINI_API_KEY=xxx          # Free at aistudio.google.com, 30 seconds, no credit card
OPENAI_API_KEY=xxx          # Optional but enables GPT specialist + DALL-E
BROWSER_USE_API_KEY=xxx     # Optional, ~$0.07/task for Cloudflare sites
DISPATCH_ENABLED=true       # Turns on multi-model routing
PLAN_TIER=enterprise        # For YES beta testing
```

---

## What Needs to Be Built

### Phase 1: Friday Ship (YES/Jonathan) 🔴 URGENT
- [ ] **GHL Voice AI Agent setup** — create agent in GHL, paste prompt from `/api/voice/prompt`, assign phone number, configure Custom Actions
- [ ] **Test call flow** — call → GHL Voice AI answers → Custom Actions hit Sarah's API → post-call transcript processed
- [ ] **Test SMS flow** — inbound SMS → GHL workflow → webhook to Sarah → Sarah processes and responds
- [ ] **Fix "Application failed to respond"** — verify Railway deploy is healthy after latest pushes
- [ ] **Test skill injection** — ask Sarah to write a blog, create a website, draft an email — verify skills are loading
- [ ] **Verify chat persistence** — sessions and messages surviving across page refreshes and deploys
- [ ] **Agent avatar persistence** — verify profile pic loads from DB on page refresh

### Phase 2: SaaS Foundation 🟡 NEXT
- [ ] **Auth layer** — login/signup page, JWT tokens, user accounts
- [ ] **Multi-tenant database** — add `business_id` to all tables (sessions, messages, artifacts, calls, skills)
- [ ] **Business onboarding flow** — create business, name your Bloomie, connect GHL, assign phone number
- [ ] **Stripe integration** — $500/$800/$1200 plans, billing portal, usage tracking
- [ ] **Business switcher** — dropdown filters all data by business_id (UI already exists, needs backend)
- [ ] **Invite system** — client owner invites team members with role-based access

### Phase 3: Product Polish 🟢 AFTER LAUNCH
- [ ] **Settings UI** — toggles for Dispatch, Image Gen, Cloud Browser, Video (framework exists)
- [ ] **Model health dashboard** — show provider status on Status page
- [ ] **Usage-aware throttling** — mid-month downshift if approaching budget
- [ ] **Response caching** — template responses for common queries
- [ ] **SSE streaming** — real-time progress events from backend (replace simulated progress)
- [ ] **Artifact preview in chat** — inline iframe for HTML artifacts within chat messages
- [ ] **Chat-to-Files linking** — artifacts created in chat visible in Files tab with session reference
- [ ] **BLOOMSHIELD** — blockchain IP protection (ThirdWeb smart accounts, social recovery)
- [ ] **Outbound calling** — Sarah initiates calls to contacts (requires Vapi or Twilio integration)
- [ ] **Video generation** — Enterprise tier, gated behind plan check
- [ ] **Mobile app** — React Native wrapper around dashboard

---

## Tier Feature Map

| Feature | Standard ($500) | Pro ($800) | Enterprise ($1,200) |
|---------|:-:|:-:|:-:|
| Chat (Haiku) | ✅ | ✅ | ✅ |
| CRM Operations | ✅ | ✅ | ✅ |
| Blog/Email/Social | ✅ (Haiku) | ✅ (Sonnet) | ✅ (Sonnet) |
| Code Specialist | ❌ | ✅ (DeepSeek) | ✅ (DeepSeek) |
| Email Specialist | ❌ | ✅ (GPT-4o-mini) | ✅ (GPT-4o) |
| Browser Automation | ✅ (self-hosted) | ✅ (+ cloud) | ✅ (+ cloud) |
| Image Generation | ❌ | ✅ | ✅ |
| Phone/Voice | ✅ | ✅ | ✅ |
| Company Skills | 5 max | 15 max | Unlimited |
| Video Generation | ❌ | ❌ | ✅ |

---

## File Structure

```
autonomous-sarah-rodriguez/
├── heartbeat-engine/
│   ├── dashboard/              # React + Vite frontend
│   │   └── src/App.jsx         # Entire dashboard (single file)
│   ├── src/
│   │   ├── api/
│   │   │   ├── chat.js         # Main chat pipeline + call ingestion
│   │   │   ├── files.js        # Artifact storage + CRUD
│   │   │   ├── dashboard.js    # Status, metrics, user avatar
│   │   │   ├── agent.js        # Agent profile management
│   │   │   ├── skills.js       # BLOOM + Company Skills API
│   │   │   ├── voice.js        # Voice prompt generator
│   │   │   ├── execute.js      # Agentic execution
│   │   │   ├── browser.js      # Browser task proxy
│   │   │   ├── events.js       # SSE stream
│   │   │   └── ghl-tools.js    # GHL API wrapper
│   │   ├── llm/
│   │   │   └── unified-client.js  # Multi-provider LLM client + failover
│   │   ├── orchestrator/
│   │   │   ├── router.js       # Tier-based task routing
│   │   │   └── task-executor.js # Scheduled task runner
│   │   ├── skills/
│   │   │   ├── skill-loader.js # Skill matching + injection
│   │   │   └── catalog/        # 6 BLOOM Skill .md files
│   │   ├── tools/
│   │   │   ├── ghl-tools.js    # CRM operations
│   │   │   ├── browser-tools.js # Browser dispatch
│   │   │   ├── image-tools.js  # Image generation
│   │   │   ├── web-search-tools.js
│   │   │   ├── internal-tools.js
│   │   │   └── enhanced-executor.js
│   │   ├── logging/            # Winston logger
│   │   ├── database/           # Pool + auto-setup
│   │   ├── heartbeat.js        # Autonomous cycle engine
│   │   └── index.js            # Express server entry point
│   └── package.json
├── browser-agent/
│   └── main.py                 # Python/FastAPI browser sidecar
└── ARCHITECTURE.md             # This file
```

---

## Cost Structure Per Bloomie

| Component | Monthly Cost | Notes |
|-----------|-------------|-------|
| Claude Haiku (primary) | $3-15 | Depends on message volume |
| Claude Sonnet (specialist) | $5-20 | Pro/Enterprise only, writing tasks |
| Railway hosting | ~$10 | Shared across tenants in SaaS model |
| Postgres | ~$5 | Railway managed |
| Letta Memory | ~$3 | Railway service |
| GHL (client's account) | $0 | Client pays their own GHL |
| Browser (self-hosted) | $0 | Runs on Railway |
| Browser (cloud fallback) | $0-5 | Only for Cloudflare-blocked sites |
| **Total cost per Bloomie** | **~$20-50/mo** | |
| **Margin at $500/mo** | **90-96%** | |
| **Margin at $1,200/mo** | **96-98%** | |
