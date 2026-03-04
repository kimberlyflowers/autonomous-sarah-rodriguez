# Agent Profile, Scheduled Tasks & Skills — Architecture Plan

## Overview

Three interconnected features that make Sarah a visible, configurable autonomous employee:

1. **Agent Profile** — click Sarah's avatar → see her job description, daily tasks, connected tools
2. **Scheduled Tasks** — recurring work Sarah does automatically (replaces confusing "cron jobs")  
3. **Skills** — capabilities tied to her tools (internal + connectors)

---

## 1. Agent Profile (UI)

**Trigger:** Click Sarah's name/avatar in the chat header

**Sections:**
- **Job Title & Description** — editable by user (e.g. "Digital Marketing Manager for Petal Core Beauty")
- **Daily Scheduled Tasks** — list of recurring tasks with frequency, next run time
- **Connected Tools** — which platforms Sarah has access to (GHL, browser, email, etc.)
- **Status** — uptime, messages handled, files created, tasks completed

**Storage:** `agent_profile` table in DB
```sql
CREATE TABLE IF NOT EXISTS agent_profile (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) DEFAULT 'bloomie-sarah-rodriguez',
  job_title TEXT,
  job_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Editable fields:** job_title, job_description
**Read-only fields:** connected tools (derived from SARAH_TOOLS), status metrics

---

## 2. Scheduled Tasks (Backend + UI)

**Replaces:** Cron jobs panel (confusing for users)

**User-facing name:** "Scheduled Tasks"

**Two creation paths:**
1. **Form UI** — pick task type, frequency, time, details
2. **Chat** — tell Sarah "Every morning write a blog post" → she creates the scheduled task via tool

**Task types (based on Sarah's capabilities):**
- Create content (blog post, email campaign, social post, SOP)
- Send email/SMS campaigns via GHL
- Research topics (browser)
- Update CRM contacts
- Generate graphics (future)
- Custom (free-text instruction)

**Storage:** `scheduled_tasks` table
```sql
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id SERIAL PRIMARY KEY,
  task_id VARCHAR(64) UNIQUE NOT NULL,
  agent_id VARCHAR(64) DEFAULT 'bloomie-sarah-rodriguez',
  name VARCHAR(500) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) NOT NULL,  -- content, email, research, crm, custom
  instruction TEXT NOT NULL,        -- what Sarah should actually do
  frequency VARCHAR(50) NOT NULL,   -- daily, weekdays, weekly, monthly, custom
  cron_expression VARCHAR(100),     -- actual cron for backend
  run_time VARCHAR(10),             -- e.g. "09:00" in user's timezone
  timezone VARCHAR(50) DEFAULT 'America/Chicago',
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  last_result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New Sarah Tool:** `create_scheduled_task`
```javascript
{
  name: "create_scheduled_task",
  description: "Create a recurring scheduled task. Use when the client asks you to do something regularly — daily, weekly, etc.",
  input_schema: {
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      taskType: { type: "string", enum: ["content", "email", "research", "crm", "custom"] },
      instruction: { type: "string", description: "What you should do each time this runs" },
      frequency: { type: "string", enum: ["daily", "weekdays", "weekly", "monthly"] },
      runTime: { type: "string", description: "Time to run, e.g. '09:00'" }
    }
  }
}
```

**Execution:** Heartbeat engine checks scheduled_tasks table on each heartbeat cycle, 
runs any that are due by sending the instruction to chatWithSarah internally.

---

## 3. Connected Tools / Skills (Read-only display)

Show which tools Sarah has access to, grouped:

**CRM & Communication:**
- GoHighLevel (contacts, conversations, emails, SMS, campaigns)
- Email sending

**Content Creation:**
- Blog posts / articles (markdown)
- Email campaigns
- Social media copy
- SOPs and documents

**Browser & Research:**
- Web browsing and research
- Screenshot capture

**File Management:**
- Create and save files
- Download deliverables

These are derived from SARAH_TOOLS array — no separate storage needed.

---

## UI Layout

### Agent Profile (slide-out panel or page)

```
┌─────────────────────────────────────┐
│ [Avatar]  Sarah Rodriguez           │
│           Digital Marketing Manager │
│           ● Online                  │
│                                     │
│ ─── Job Description ─── [Edit]     │
│ Manages content creation, social    │
│ media, email campaigns, and CRM     │
│ for Petal Core Beauty...            │
│                                     │
│ ─── Scheduled Tasks ─── [+ Add]    │
│ ☀ Daily 9:00am  Write blog post    │
│ ☀ Weekdays 8am  Check new leads    │
│ 📅 Weekly Mon   Send newsletter     │
│                                     │
│ ─── Connected Tools ───            │
│ ✅ GoHighLevel CRM                  │
│ ✅ Email & SMS                      │
│ ✅ Browser & Research               │
│ ✅ File Creation                    │
│ ⬜ Google Drive (not connected)     │
│ ⬜ Social Media (coming soon)       │
│                                     │
│ ─── Stats ───                      │
│ 40 messages  │  8 files  │  3 tasks │
└─────────────────────────────────────┘
```

### Scheduled Task Form (modal)

```
┌─────────────────────────────────────┐
│ + New Scheduled Task                │
│                                     │
│ Task name: [Write daily blog post ] │
│                                     │
│ What should Sarah do?               │
│ [Write a blog post about AI for   ] │
│ [financial advisors. Focus on...   ] │
│                                     │
│ Type: [Content ▾]                   │
│ Frequency: [Daily ▾]               │
│ Time: [09:00 AM ▾]                 │
│                                     │
│ [Cancel]           [Create Task]    │
└─────────────────────────────────────┘
```

---

## Implementation Order

1. **Backend API** — `/api/agent/profile` and `/api/agent/tasks` endpoints
2. **DB tables** — agent_profile + scheduled_tasks  
3. **Agent Profile UI** — click avatar → slide-out panel
4. **Scheduled Tasks UI** — list + add form within profile
5. **Sarah tool** — `create_scheduled_task` so she can create tasks from chat
6. **Heartbeat integration** — execute scheduled tasks on schedule
7. **Jobs tab update** — rename from "Jobs" to show scheduled task status

---

## Files to Create/Modify

**New:**
- `/heartbeat-engine/src/api/agent.js` — profile + tasks API

**Modify:**
- `/heartbeat-engine/src/index.js` — wire agent API routes
- `/heartbeat-engine/src/api/chat.js` — add create_scheduled_task tool
- `/heartbeat-engine/dashboard/src/App.jsx` — Agent Profile panel, task form
- `/heartbeat-engine/src/heartbeat.js` — execute scheduled tasks on cycle
