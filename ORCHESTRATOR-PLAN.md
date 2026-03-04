# Sarah Orchestrator Architecture — Multi-Model Task Routing

## Overview

Sarah is the supervisor/orchestrator. She never does the heavy lifting herself.
When a task comes in (scheduled or chat), she:

1. Reads the instruction + her Letta memory for context
2. Classifies the task type
3. Routes to the best model for the job
4. Reviews the output
5. Saves results + logs evidence

## Model Routing Table

| Task Type    | Model                  | Why                                    | Cost Tier |
|-------------|------------------------|----------------------------------------|-----------|
| Writing     | Claude Sonnet 4.5      | Best long-form quality                 | $$        |
| Email copy  | GPT-4o                 | Great at short persuasive copy         | $$        |
| Coding      | DeepSeek V3            | Strong coder, very cheap               | $         |
| CRM actions | Claude Haiku           | Just API calls, no creativity needed   | ¢         |
| Research    | Claude Haiku + search  | Fast summarization                     | $         |
| Design      | GPT image gen / Flux   | Image generation                       | $$        |
| Data/CSV    | Claude Haiku           | Structured data, fast                  | ¢         |
| Orchestrate | Claude Haiku           | Sarah herself — routing decisions      | ¢         |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  HEARTBEAT ENGINE (ticks every 60s)             │
│  ┌─────────────────────────────────┐            │
│  │ Check scheduled_tasks table     │            │
│  │ Any tasks past next_run_at?     │            │
│  └──────────────┬──────────────────┘            │
│                 │ YES                            │
│                 ▼                                │
│  ┌─────────────────────────────────┐            │
│  │ SARAH — Orchestrator (Haiku)    │            │
│  │                                 │            │
│  │ 1. Load Letta memory context    │            │
│  │ 2. Read task instruction        │            │
│  │ 3. Classify task type           │            │
│  │ 4. Build context-rich prompt    │            │
│  │ 5. Route to sub-agent           │            │
│  └──────────────┬──────────────────┘            │
│                 │                                │
│    ┌────────────┼────────────┐                  │
│    ▼            ▼            ▼                   │
│ ┌──────┐  ┌──────────┐  ┌────────┐             │
│ │Claude│  │  GPT-4o  │  │DeepSeek│             │
│ │Sonnet│  │          │  │  V3    │             │
│ │      │  │          │  │        │             │
│ │Writer│  │Email/Copy│  │ Coder  │             │
│ └──┬───┘  └────┬─────┘  └───┬────┘             │
│    │           │             │                   │
│    └───────────┴─────────────┘                  │
│                 │                                │
│                 ▼                                │
│  ┌─────────────────────────────────┐            │
│  │ SARAH — Post-process (Haiku)    │            │
│  │                                 │            │
│  │ 1. Review sub-agent output      │            │
│  │ 2. Save files via create_artifact│           │
│  │ 3. Execute CRM actions          │            │
│  │ 4. Log evidence to task_run     │            │
│  │ 5. Update next_run_at           │            │
│  └─────────────────────────────────┘            │
└─────────────────────────────────────────────────┘
```

## Model Provider Config

Stored in environment variables:

```env
# Provider API keys
ANTHROPIC_API_KEY=sk-ant-...        # Claude (Haiku + Sonnet)
OPENAI_API_KEY=sk-...               # GPT-4o
DEEPSEEK_API_KEY=sk-...             # DeepSeek V3

# Model routing defaults (overridable per task)
MODEL_ORCHESTRATOR=claude-haiku       # Sarah's brain — cheap
MODEL_WRITING=claude-sonnet           # Blog posts, long content
MODEL_EMAIL=gpt-4o                    # Short copy, emails
MODEL_CODING=deepseek-v3              # Scripts, HTML, code
MODEL_CRM=claude-haiku                # API calls, data work
MODEL_RESEARCH=claude-haiku           # Summaries with search
MODEL_IMAGE=gpt-image                 # Flyer/graphic generation
```

## Sub-Agent Call Structure

Each sub-agent call is a standalone API request:

```javascript
async function callSubAgent(provider, model, systemPrompt, userPrompt) {
  switch (provider) {
    case 'anthropic':
      return await callClaude(model, systemPrompt, userPrompt);
    case 'openai':
      return await callOpenAI(model, systemPrompt, userPrompt);
    case 'deepseek':
      return await callDeepSeek(model, systemPrompt, userPrompt);
  }
}
```

Each sub-agent receives:
- **System prompt**: Role-specific (e.g. "You are a professional blog writer for a skincare brand targeting women 25-45")
- **Context from Letta**: Brand voice, past preferences, corrections
- **Task instruction**: What to actually produce
- **Output format**: What Sarah expects back (markdown, HTML, JSON, etc.)

## Routing Logic (Sarah's Orchestration Prompt)

```
You are Sarah Rodriguez, an AI orchestrator. You manage a team of AI sub-agents.

Given a task instruction and your memory context, decide:
1. What type of work is this? (writing, email, coding, crm, research, design, data)
2. What context does the sub-agent need from your memory?
3. What specific prompt should the sub-agent receive?
4. What output format do you expect?

Respond with JSON:
{
  "taskType": "writing",
  "model": "claude-sonnet",
  "subAgentSystemPrompt": "You are a professional blog writer...",
  "subAgentUserPrompt": "Write a 1000-word blog post about...",
  "expectedOutput": "markdown",
  "postProcessing": ["save_as_file", "log_evidence"]
}
```

## Database: task_runs table

```sql
CREATE TABLE IF NOT EXISTS task_runs (
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(64) UNIQUE NOT NULL,
  task_id VARCHAR(64) REFERENCES scheduled_tasks(task_id),
  status VARCHAR(20) DEFAULT 'queued',  -- queued, pending, completed, failed
  instruction TEXT,
  model_used VARCHAR(100),              -- which model actually did the work
  provider VARCHAR(50),                 -- anthropic, openai, deepseek
  tokens_used INTEGER DEFAULT 0,
  cost_cents NUMERIC(10,4) DEFAULT 0,
  result TEXT,
  evidence JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Evidence JSON Structure

```json
{
  "files": [
    { "name": "blog-post.md", "size": "4.2 KB", "artifactId": 12 }
  ],
  "actions": [
    { "type": "email_sent", "label": "Email sent to Maria Chen", "detail": "Welcome email", "crmLink": "https://bloom-crm.com/conversations/abc123" },
    { "type": "contact_updated", "label": "Updated David Park", "detail": "Status: contacted", "crmLink": "https://bloom-crm.com/contacts/def456" }
  ],
  "screenshots": [],
  "modelRouting": {
    "orchestrator": { "model": "claude-haiku", "tokens": 450, "costCents": 0.02 },
    "worker": { "model": "claude-sonnet", "tokens": 3200, "costCents": 2.40 }
  }
}
```

## Cost Tracking

Every sub-agent call logs:
- Provider + model
- Input/output tokens
- Cost in cents (looked up from pricing table)

This data feeds into the Activity page and future billing/analytics.

## Token Pricing Reference (approx)

| Model           | Input $/1M  | Output $/1M | Typical task cost |
|----------------|-------------|-------------|-------------------|
| Claude Haiku   | $0.25       | $1.25       | $0.001 - $0.01   |
| Claude Sonnet  | $3.00       | $15.00      | $0.02 - $0.10    |
| GPT-4o         | $2.50       | $10.00      | $0.02 - $0.08    |
| DeepSeek V3    | $0.27       | $1.10       | $0.001 - $0.01   |

## Files to Create/Modify

**New:**
- `/heartbeat-engine/src/orchestrator/router.js` — Model routing logic
- `/heartbeat-engine/src/orchestrator/providers.js` — API call wrappers for each provider
- `/heartbeat-engine/src/orchestrator/task-executor.js` — Scheduled task execution loop

**Modify:**
- `/heartbeat-engine/src/heartbeat.js` — Add scheduled task check to heartbeat cycle
- `/heartbeat-engine/src/api/agent.js` — Add task_runs table, GET /api/agent/runs endpoint
- `/heartbeat-engine/src/index.js` — Wire new routes

## Implementation Order

1. Provider wrappers (Claude, OpenAI, DeepSeek API calls)
2. Router (Sarah classifies task → picks model)
3. Task executor (heartbeat integration → orchestrate → execute → save)
4. task_runs table + API endpoints
5. Activity page wired to real data
6. Cost tracking
