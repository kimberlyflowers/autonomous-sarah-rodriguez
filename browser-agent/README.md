# BLOOM Browser Agent — browser-use Sidecar

AI-driven browser automation sidecar for BLOOM Bloomie agents.  
Uses [browser-use](https://github.com/browser-use/browser-use) + [Browserless](https://browserless.io) on Railway.

## Architecture

```
Sarah's Brain (Claude API)
    ↓ tool call: "browse this website and fill the form"
    ↓
Sarah's Tool Executor (Node.js)
    ↓ POST /browse { task, url }
    ↓
Browser Agent Sidecar (this service — Python/FastAPI)
    ↓ browser-use Agent with Claude LLM
    ↓ connects via CDP WebSocket
    ↓
Browserless (Railway template — managed Chrome)
    ↓ headless Chromium
    ↓ handles memory, zombie procs, fonts, scaling
    ↓
Target Website
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check — Railway monitors this |
| POST | `/browse` | Execute AI-driven browser task |
| POST | `/screenshot` | Take screenshot of a URL |

### POST /browse

```json
{
  "task": "Go to the GHL dashboard and create a new contact named John Doe",
  "url": "https://app.gohighlevel.com",
  "max_steps": 25,
  "secret": "your-shared-secret"
}
```

Response:
```json
{
  "success": true,
  "result": "Successfully created contact John Doe in GHL",
  "steps_taken": 8,
  "duration_ms": 12340,
  "url_final": "https://app.gohighlevel.com/contacts/abc123"
}
```

## Deployment — Railway

### Prerequisites
1. Deploy the **Browserless v2** template in your Railway project (one-click)
2. Note the internal URL: `ws://browserless.railway.internal:3000`
3. Note the auto-generated `TOKEN` from the Browserless service

### Deploy this sidecar
1. Create a new service in your Railway project from this GitHub repo
2. Set environment variables:

```bash
BROWSERLESS_WS_URL=ws://browserless.railway.internal:3000
BROWSERLESS_TOKEN=<token from Browserless service>
ANTHROPIC_API_KEY=<your Anthropic key>
ANTHROPIC_MODEL=claude-haiku-4-5-20251001
SIDECAR_SECRET=<generate a random string — Sarah uses this to auth>
```

3. Deploy — Railway builds the Dockerfile, starts the service
4. Verify: `GET /health` should return `{"status":"healthy"}`

### Wire into Sarah

Add the browser tool to Sarah's tool executor. In `heartbeat-engine/src/tools/internal-tools.js`:

```javascript
{
  name: "browser_task",
  description: "Execute a browser automation task using AI. The agent can navigate websites, click buttons, fill forms, extract data, and interact with web pages intelligently.",
  input_schema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Natural language description of what to do in the browser"
      },
      url: {
        type: "string",
        description: "Starting URL to navigate to (optional)"
      },
      max_steps: {
        type: "integer",
        description: "Max steps the agent can take (default 25)",
        default: 25
      }
    },
    required: ["task"]
  }
}
```

Tool executor handler:

```javascript
case "browser_task": {
  const res = await fetch(`${process.env.BROWSER_AGENT_URL}/browse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task: input.task,
      url: input.url,
      max_steps: input.max_steps || 25,
      secret: process.env.BROWSER_AGENT_SECRET,
    }),
  });
  const data = await res.json();
  return data.success
    ? `Browser task completed in ${data.steps_taken} steps (${data.duration_ms}ms): ${data.result}`
    : `Browser task failed: ${data.error}`;
}
```

Add to Sarah's Railway env vars:
```bash
BROWSER_AGENT_URL=http://browser-agent.railway.internal:8080
BROWSER_AGENT_SECRET=<same secret as SIDECAR_SECRET>
```

## Local Development

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Set env vars
export BROWSERLESS_WS_URL=ws://localhost:3000
export BROWSERLESS_TOKEN=your-token
export ANTHROPIC_API_KEY=sk-ant-...

python main.py
```

## BLOOM Engineering — March 2026
