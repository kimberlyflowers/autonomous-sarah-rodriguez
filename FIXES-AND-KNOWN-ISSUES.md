# Fixes & Known Issues — Living Doc

Track of bugs found, root causes, fixes applied, and how to diagnose them if they come back.

---

## Meigen / InfiniteTalk Lip Sync

### 1. Aspect Ratio Always Generated as 16:9 (Fixed)

**Symptom:** User selects 9:16 portrait in the UI, video comes out 16:9 landscape.

**Root Cause (`ugc-pipeline`):**
`submitMeigenVideoJob` in `src/services/meigen.js` called `resolvePublicUrl(imageUrl, imagePath)` which prefers the https `imageUrl` over the local `imagePath`. The local file had already been crop-framed to the correct aspect ratio by `frameImageForStudio()` — but the raw landscape `imageUrl` was being uploaded to RunPod instead.

**Fix (`ugc-pipeline` — commit `3e31d5a`):**
```js
// Before:
const resolvedImage = await resolvePublicUrl(imageUrl, imagePath);

// After — always prefer the locally framed file when available:
const resolvedImage = imagePath
  ? await uploadToTempHost(imagePath)
  : await resolvePublicUrl(imageUrl, null);
```

**Root Cause (`videoclone-ai`):**
VideoCloneAI has its own `RUNPOD_MEIGEN_API_KEY` and submits directly to RunPod, bypassing Bloom Studio's framing. The raw image URL was sent with no cropping.

**Fix (`videoclone-ai` — commit `ec63d8d`):**
Added `frameImageForMeigen(imageUrl, aspectRatio)` using `sharp` + `uploadBufferToTempHost`. Frames the image to the correct dimensions before submitting:
- 9:16 → 720×1280
- 16:9 → 1280×720
- 4:5 → 1024×1280
- 3:4 → 960×1280
- 2:3 → 853×1280
- 1:1 → 1024×1024
- 3:2 → 1152×768
- 4:3 → 1024×768
- 21:9 → 1344×576

**How to diagnose if it comes back:**
- Pull the latest completed Meigen job from the API: `GET /api/studio/jobs?limit=5`
- Get the RunPod job ID (`providerJobId`), query `https://api.runpod.ai/v2/infinitetalk/status/{jobId}`
- Download the `output.result` video URL and run: `/path/to/ffprobe -v error -show_entries stream=width,height -of default=noprint_wrappers=1 video.mp4`
- Width/height should match the selected aspect ratio.

---

### 2. Voice Selection Ignored — Always Used Default Voice (Fixed)

**Symptom (`videoclone-ai`):** User selects a different Kokoro voice in the node settings, but the generated video always uses `af_heart` (the default).

**Root Cause:**
`runVideoNode` read `sourceAudioUrl = audioSourceNode?.data?.audioUrl` — a stale cached URL from the previous generation. When running the video node directly (not the full pipeline), audio was never re-generated with the newly selected voice.

**Fix (`videoclone-ai` — commit `ec63d8d`):**
Added audio re-generation block inside `runVideoNode` before Meigen submission:
```js
if (isMeigen && audioSourceNode && !audioSourceNode.data?.asset?.dataUrl) {
  const audioResult = await runAudioNode(audioSourceNode.id);
  if (audioResult?.audioUrl) freshAudioUrl = audioResult.audioUrl;
}
```

**How to diagnose if it comes back:**
- Generate two videos back to back using two different voices
- Check the audio tracks of the resulting videos — they should be different
- If the same audio appears, the stale `audioUrl` cache is being used again

---

### 3. Quality Setting (480p vs 720p) Always Generated 480p (Fixed — two separate bugs)

#### Bug A — Wrong field name read from request body (`ugc-pipeline`)

**Symptom:** Selecting 720p in Bloom Studio UI has no effect; all videos generate at ~480p (464×832 or 832×464).

**Root Cause:**
`studio.js` read `req.body.meigenSize` to determine quality. The frontend sends the quality as `req.body.resolution`. Since `meigenSize` was never set, all calls fell back to the hardcoded default `'480p'`.

**Fix (`ugc-pipeline` — commit `d2fd08a`):**
Changed all 8 call sites in `studio.js`:
```js
// Before:
getMeigenSize(req.body.meigenSize || '480p')

// After:
getMeigenSize(req.body.meigenSize || req.body.resolution || '480p')
```
Applies to the `meigen`, `infinitetalk-hd`, and `musetalk` engine paths.

#### Bug B — Wrong RunPod parameter name (`ugc-pipeline` + `videoclone-ai`)

**Symptom:** Even after Bug A fix, videos still generate at 480p. Sending `size: '720p'` to the `infinitetalk` endpoint has no effect.

**Root Cause:**
The `infinitetalk` public serverless endpoint does **not** use `size` for resolution control. It uses `resolution`. Tested all three candidate parameter names directly against the endpoint:

| Parameter sent | Output dimensions |
|---|---|
| `size: '720p'` | 832×464 (480p) |
| `quality: '720p'` | 832×464 (480p) |
| `resolution: '720p'` | **1280×704 (720p)** |

`meigen.js` was sending `size`, VideoCloneAI's `server.js` was sending both `size` and `resolution` (the correct one was present but `size` was the primary).

**Fix (`ugc-pipeline` — commit `e8dc94e`):**
```js
// meigen.js — changed:
size: resolvedSize
// to:
resolution: resolvedSize
```

**Fix (`videoclone-ai` — commit `442d9a2`):**
Removed the redundant `size: requestedResolution` line; kept only `resolution: requestedResolution`.

**How to diagnose if it comes back:**
- Download a completed Meigen video and run ffprobe
- 720p output should be 1280×704 (16:9) or 704×1280 (9:16)
- 480p output is 832×464 (16:9) or 464×832 (9:16)
- To test the endpoint directly:
```bash
curl -X POST "https://api.runpod.ai/v2/infinitetalk/run" \
  -H "Authorization: Bearer $RUNPOD_MEIGEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"image":"<url>","audio":"<url>","resolution":"720p","prompt":"...","enable_safety_checker":true}}'
```

---

### 4. ElevenLabs Audio Not Working for Tenant-Connected Accounts (Fixed)

**Symptom:** User adds their ElevenLabs API key in Settings, voices appear in the dropdown, but hitting Generate returns `"ElevenLabs API key is not configured"`.

**Root Cause:**
`createElevenLabsAudio` in `studio.js` always read `process.env.ELEVENLABS_API_KEY` (a server-level env var). The tenant's stored key (saved via Settings UI) was never consulted. The voice list endpoint in `tts.js` already had `resolveElevenLabsKey(req)` which fetches the tenant key correctly — but that lookup was not used in the audio generation path.

**Fix (`ugc-pipeline` — commit `7eefe3c`):**
- Added `getTenantSetting` to the postgres import in `studio.js`
- Updated `createElevenLabsAudio` to look up the tenant key first:
```js
const tenantKey = (tenantId && hasDatabase())
  ? await getTenantSetting(tenantId, 'elevenlabs_api_key').catch(() => null)
  : null;
const apiKey = tenantKey || process.env.ELEVENLABS_API_KEY;
```

**How to diagnose if it comes back:**
- Check `getTenantSetting(tenantSlug, 'elevenlabs_api_key')` returns the key from the `tenant_settings` postgres table
- Confirm the Settings save endpoint is writing to the correct key name (`elevenlabs_api_key`)
- If the key is in DB but generation still fails, check that `req.tenant.slug` is being passed correctly to `createElevenLabsAudio`

---

## Key Endpoint Reference

| Service | RunPod Endpoint | Env Var | Notes |
|---|---|---|---|
| Meigen (standard) | `infinitetalk` | `RUNPOD_MEIGEN_ENDPOINT_ID` | Public serverless. Uses `resolution` param (NOT `size`) |
| Meigen API key | — | `RUNPOD_MEIGEN_API_KEY` | Separate from `RUNPOD_API_KEY` — do NOT replace |
| InfiniteTalk HD | `u42wikzcqz3tkk` | `RUNPOD_INFINITETALK_ENDPOINT_ID` | Private endpoint. Uses `audio_url`, `image_url`, `quality` params |
| Kokoro TTS | `r1wkulmg30wqon` | `RUNPOD_KOKORO_ENDPOINT_ID` | Separate key: `RUNPOD_KOKORO_API_KEY` |

---

## VideoCloneAI — App Blank (Grey Screen) Fix

**Symptom:** App loads but shows a completely blank grey screen. No elements render.

**Root Cause:** Commit `c1f90a1` added JSX that references `showElConnect`, `elConnected`, `elevenLabsVoices`, `elApiKeyInput`, `elConnecting` but never declared them with `useState`. Every render threw `ReferenceError: showElConnect is not defined`. React caught it silently and rendered nothing. No console errors visible.

**Fix (`videoclone-ai` — commit `f57d0c7`):**
Added the 5 missing state declarations to the App component:
```js
const [showElConnect, setShowElConnect] = useState(false);
const [elConnected, setElConnected] = useState(null);
const [elevenLabsVoices, setElevenLabsVoices] = useState(elevenLabsVoicesFallback);
const [elApiKeyInput, setElApiKeyInput] = useState('');
const [elConnecting, setElConnecting] = useState(false);
```

**How to diagnose if it comes back:**
- Open browser DevTools → Application → Local Storage: check if `videoclone.ai.canvas-state.v1` is extremely large (>1MB could indicate a loop)
- Add a temporary error boundary around `<App />` to surface silent render errors:
```jsx
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <pre style={{color:'red',padding:20}}>{String(this.state.error)}</pre>;
    return this.props.children;
  }
}
// wrap: <ErrorBoundary><App /></ErrorBoundary>
```
- **NEVER clear localStorage without first reading/backing up `videoclone.ai.canvas-state.v1`** — that key holds all canvas workflows

---

## VideoCloneAI — Canvas State Persistence

**Problem:** Canvas tabs and workflow templates were stored only in the Railway container's local filesystem and browser localStorage. Every Railway deploy wiped the server-side JSON files. Clearing localStorage wiped the browser side. Workflows were permanently lost.

**Fix (`videoclone-ai` — commit `9aea43d`):**
Canvas state now written to both:
1. **Postgres** (`videoclone_state` table) — durable, survives all deploys
2. **Local JSON files** — fast fallback

Read order: Postgres first → local file (with automatic backfill to Postgres on read).

Table schema:
```sql
CREATE TABLE IF NOT EXISTS videoclone_state (
  key TEXT NOT NULL,
  kind TEXT NOT NULL,   -- 'canvases' | 'workflow-templates' | 'library'
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (key, kind)
);
```

**Affects:** `GET/POST /api/canvases` and `POST /api/workflow-templates`

**Important:** The Railway `DATABASE_URL` env var must be set (it is, pointing to the attached Postgres service). If it's ever removed, the server falls back to local files only.

---

## Safety Rules (Never Break These)

- **Never change `RUNPOD_API_KEY`** — it's used by multiple endpoints; changing it breaks everything else
- **Never `SELECT *` from `ugc_asset_files`** — the `file_data` bytea column will cause OOM crash
- **Kokoro uses `RUNPOD_KOKORO_API_KEY` only** — do not share with other endpoints
- **Recent job data is in Railway Postgres, not Supabase** — Supabase tables for jobs/assets are empty for recent data

---

*Last updated: 2026-06-01*
