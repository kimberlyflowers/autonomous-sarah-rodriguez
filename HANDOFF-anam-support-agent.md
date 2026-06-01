# Handoff: Anam Live Talking Customer Support Agent — Bloom Studio

**Session goal:** Build and embed an interactive real-time talking avatar agent into the Bloom Studio app (ugc-pipeline / lovely-wonder) that acts as a live customer support agent for the platform.

---

## What We're Building

A floating, embeddable **live talking avatar** powered by Anam.ai that appears inside the Bloom Studio web app. Users can click to open it, speak or type questions, and receive real-time video + voice responses from a custom Bloom Studio support persona. It replaces a static FAQ with a conversational AI agent that knows everything about Bloom Studio.

---

## Architecture Overview

```
[User browser — Bloom Studio app.js]
        |
        | WebRTC / Anam SDK (client-side)
        v
[Anam.ai API] ← → [Persona config + knowledge]
        |
        | (optional) Tool calls back to Bloom Studio
        v
[Bloom Studio server — /api/support/* endpoints]
        |
        v
[Context: tenant data, job history, voice list, etc.]
```

### Components

| Component | Location | What it does |
|---|---|---|
| Anam SDK embed | `public/js/app.js` (Bloom Studio frontend) | Streams avatar video + handles user mic/text input |
| Floating widget UI | `public/js/app.js` + `public/css/style.css` | The button, panel, video element, chat UI |
| Session init endpoint | `src/api/support.js` (new file) | Creates Anam session token server-side using `ANAM_API_KEY` |
| Agent persona config | Anam dashboard + `src/api/support.js` | Defines the avatar's face, voice, system prompt |
| Knowledge base | System prompt injected at session start | Everything the agent knows about Bloom Studio |

---

## Anam Integration Details

### SDK

```html
<!-- In index.html or dynamically loaded -->
<script src="https://unpkg.com/@anam-ai/js-sdk@latest/dist/index.js"></script>
```

Or via npm if using a bundler:
```bash
npm install @anam-ai/js-sdk
```

### Session Flow

```
1. User clicks "Support" button in Bloom Studio
2. Browser calls POST /api/support/session (Bloom Studio server)
3. Server calls Anam API with ANAM_API_KEY → gets session token
4. Browser receives session token
5. Browser initialises AnamClient with token
6. Anam streams avatar video into <video> element
7. User speaks or types → Anam processes → avatar responds live
```

### Server-side session creation (`src/api/support.js`)

```javascript
const fetch = require('node-fetch');

router.post('/api/support/session', async (req, res) => {
  const apiKey = process.env.ANAM_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Support agent not configured.' });

  // Build context about the current tenant
  const tenantSlug = req.tenant?.slug || 'unknown';
  const systemPrompt = buildSupportSystemPrompt({ tenantSlug });

  const response = await fetch('https://api.anam.ai/v1/sessions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personaId: process.env.ANAM_PERSONA_ID,
      systemPrompt,
      // Optional: pass context from current session
      context: { tenant: tenantSlug }
    })
  });

  const data = await response.json();
  res.json({ sessionToken: data.sessionToken, sessionId: data.id });
});
```

### Client-side initialisation (`app.js`)

```javascript
async function openSupportAgent() {
  // 1. Get session token from our server
  const { sessionToken } = await fetch('/api/support/session', { method: 'POST' }).then(r => r.json());

  // 2. Init Anam client
  const client = window.AnamSDK.createClient(sessionToken);

  // 3. Stream into video element
  await client.streamToVideoAndAudioElements('support-avatar-video', 'support-audio');

  // 4. Start the session
  await client.startSession();
}
```

---

## Agent Persona Design

### Name & Appearance
- **Name:** Bloom — the Bloom Studio support agent
- **Appearance:** Professional, approachable female avatar (configured in Anam dashboard)
- **Voice:** Warm, clear, American English — Anam native TTS

### System Prompt (injected server-side)

```
You are Bloom, the customer support agent for Bloom Studio — an AI video creation platform.

You help users with:
- Generating lip sync videos using Meigen/InfiniteTalk (selecting 9:16 vs 16:9, 480p vs 720p)
- Choosing and previewing Kokoro voices (28 English voices, free, no API key needed)
- Connecting their ElevenLabs account (Settings → ElevenLabs → paste API key)
- Understanding video generation status (processing, completed, failed)
- Downloading or sharing completed videos from the Library
- Understanding the Campaign Builder: subject, script, voice, aspect ratio
- Troubleshooting: why videos look low quality, aspect ratio wrong, voice not changing

You do NOT have access to the user's account or job data directly.
You speak in a friendly, concise way. Keep answers under 3 sentences unless asked for detail.
Never make up features that don't exist.

Platform facts:
- Kokoro voices: 28 English voices, all free, no API key required
- ElevenLabs: requires API key from user's own ElevenLabs account
- Meigen: lip sync video engine. Supports 480p and 720p. Aspect ratios: 9:16, 16:9, 1:1, 4:5, etc.
- Video generation takes 60–180 seconds depending on quality
- Library shows all completed videos, proxied from Bloom Studio server
- Settings page: manage ElevenLabs connection, API keys, voice preferences
```

---

## UI Design

### Widget: Floating Button (bottom-right corner)

```
[Bloom avatar icon] Support
```

- Fixed position, bottom-right, above any existing chat
- Click opens the support panel
- Shows unread indicator if Bloom sends a proactive message on load

### Panel Layout

```
┌─────────────────────────────┐
│  [X]        Bloom Support   │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ │   [Avatar video stream] │ │  ← 16:9 video, ~320×180px
│ │                         │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ How can I help you?     │ │  ← transcript / chat
│ │ User: my video is...    │ │
│ └─────────────────────────┘ │
│ [🎤 Hold to speak] [Type ▶] │
└─────────────────────────────┘
```

### States
- **Idle:** Avatar breathing / idle animation, prompt shown
- **Listening:** Mic active indicator, avatar attentive
- **Thinking:** "..." indicator, avatar slight pause
- **Speaking:** Lip sync active, audio playing

---

## Environment Variables Needed

Add to Bloom Studio Railway service (`lovely-wonder`):

| Variable | Description |
|---|---|
| `ANAM_API_KEY` | Anam API key from anam.ai dashboard |
| `ANAM_PERSONA_ID` | The persona UUID created in Anam dashboard |

---

## Files to Create / Modify

### New files
- `ugc-pipeline/src/api/support.js` — session creation endpoint, system prompt builder
- `ugc-pipeline/public/js/support-agent.js` — client-side Anam SDK init and widget logic (or inline in app.js)
- `ugc-pipeline/public/css/support-agent.css` — widget styles

### Modified files
- `ugc-pipeline/src/index.js` — register `/api/support` routes
- `ugc-pipeline/public/index.html` — add Anam SDK script tag + widget mount point
- `ugc-pipeline/public/js/app.js` — add floating button click handler, open/close panel

---

## Anam Dashboard Setup (do before coding)

1. Go to [anam.ai](https://anam.ai) → create account
2. Create a new **Persona**: choose avatar face, voice, idle behavior
3. Note the `personaId` — add to Railway env as `ANAM_PERSONA_ID`
4. Generate an **API Key** — add to Railway env as `ANAM_API_KEY`
5. Configure allowed domains: add `lovely-wonder-production-3c61.up.railway.app`

---

## Phased Build Plan

### Phase 1 — Core embed (MVP)
- Server session endpoint
- Basic floating button + panel UI
- Avatar streams and responds to text input
- Hardcoded system prompt

### Phase 2 — Voice input
- WebRTC mic access
- Push-to-talk or VAD (voice activity detection)
- Visual mic indicator

### Phase 3 — Context awareness
- Pass current tenant slug into system prompt
- Optional: pass recent job status so agent can reference "your last video"
- Tool call: agent can query job status and read it aloud

### Phase 4 — Proactive help
- If a job fails → agent says "I noticed your video failed, want help?"
- If user has been idle 2+ min on campaign builder → agent offers tips

---

## Key References

- **Anam JS SDK docs:** https://docs.anam.ai/sdk/javascript
- **Anam API docs:** https://docs.anam.ai/api
- **Bloom Studio repo:** `autonomous-sarah-rodriguez/ugc-pipeline`
- **Bloom Studio URL:** https://lovely-wonder-production-3c61.up.railway.app
- **Bloom Studio server entry:** `ugc-pipeline/src/index.js`
- **Frontend app:** `ugc-pipeline/public/js/app.js`
- **Current tenant auth:** Bearer token via `/api/auth/login` with `{ workspace, accessKey }`
- **Full access key:** `b9a6856f9b318fa641b0ad518577aed1` (from `UGC_TENANTS` env var)

---

## Context for New Session

The new session should:
1. Read this doc fully before writing any code
2. Check `ugc-pipeline/src/index.js` to see how existing routes are registered
3. Check `ugc-pipeline/public/js/app.js` to find where to add the widget button (search for `campaignSection` or `<nav` or `header`)
4. Set up the Anam dashboard first (persona + API key) before coding
5. Start with Phase 1 only — get the avatar streaming before adding voice

---

*Created: 2026-06-01 | Next: Canvas layout/video reconnection issues (separate session)*
