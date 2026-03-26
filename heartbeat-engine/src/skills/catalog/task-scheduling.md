---
name: task-scheduling
description: "Self-schedule recurring tasks. Use whenever the user asks you to do something regularly, on a schedule, automatically, or recurring. Triggers: 'schedule', 'every day', 'every hour', 'recurring', 'automate', 'run daily', 'set up a task', 'remind me', 'check every', 'follow up on', 'monitor', 'keep doing', 'start doing X regularly'. Also use when you decide during autonomous work that a task should repeat."
---

# Task Self-Scheduling — Bloomie Recurring Task System

You can schedule tasks for yourself. This is real — you have tools that write to the scheduled_tasks database. The heartbeat engine picks them up and executes them at the right time. DO NOT FAKE THIS. If the tool fails, report the exact error to the user.

## MANDATORY FLOW — EVERY SCHEDULING REQUEST

### Step 1: Clarify with bloom_clarify (REQUIRED)

Before scheduling ANYTHING, use `bloom_clarify` to confirm these details:

**Question 1: What exactly should I do?**
Get the specific task. "Check emails" is too vague — you need: "Check Gmail inbox for new client emails, summarize each one, and notify you of anything urgent via SMS."

**Question 2: How often?**
Options to present:
- "Every 10 minutes" — for monitoring/alerts (email checks, lead notifications)
- "Every 30 minutes" — for frequent checks (social mentions, CRM updates)
- "Hourly" — for regular monitoring (inbox, lead follow-ups)
- "Daily" — most common (blog posts, reports, email campaigns)
- "Weekdays only" — business-hours tasks (M-F)
- "Weekly" — summary reports, weekly content
- "Monthly" — monthly reports, newsletter digests

**Question 3: What time?**
For daily/weekly/monthly, ask what time. Present common options:
- "6:00 AM — Early bird, before business hours"
- "9:00 AM — Start of business day"
- "12:00 PM — Midday"
- "5:00 PM — End of business day"
- "Custom time — I'll specify"

### Step 2: Check for Duplicates

Call `bloom_list_scheduled_tasks` to see if a similar task already exists. If it does:
- Tell the user: "You already have a similar task: [name]. Want me to update that one instead, or create a new one?"
- Don't create duplicates silently.

### Step 3: Write a Detailed Instruction

The `instruction` field is what gets executed by the heartbeat engine. It must be self-contained — written as if you're giving yourself instructions for a cold start. Include:

- **What to do** — specific actions, not vague goals
- **What tools to use** — name the exact tools (ghl_search_contacts, web_search, etc.)
- **What skills to load** — if content creation is involved (load_skill("blog-content"))
- **What output to produce** — file, CRM draft, notification, etc.
- **How to notify the user** — always end with notify_owner or a chat message
- **Error handling** — what to do if something fails

**Good instruction example:**
```
1. Load skill: blog-content
2. Choose today's topic from the rotation: [Mon: AI trends, Tue: Small biz tips, Wed: Marketing, Thu: Hiring, Fri: Customer service]
3. Call image_generate to create a hero image for the topic
4. Write a 600-800 word blog post following the blog-content skill guidelines
5. Call ghl_create_blog_post to save as a CRM draft with the hero image
6. Call create_artifact to save a backup copy
7. Call notify_owner via SMS: "New blog post ready for review: [title]. Check your CRM drafts."
If any step fails, call notify_owner with the exact error message. Do NOT skip steps silently.
```

**Bad instruction example:**
```
Write a blog post about something interesting.
```

### Step 4: Create the Task

Call `bloom_schedule_task` with:
- `name`: Short, descriptive (e.g., "Daily Blog Post", "Hourly Inbox Monitor")
- `description`: What and why (e.g., "Creates a daily blog post promoting the business")
- `instruction`: The detailed instruction from Step 3
- `frequency`: The confirmed frequency
- `runTime`: The confirmed time in HH:MM format
- `taskType`: Best match from: content, email, followup, reporting, monitoring, custom

### Step 5: Confirm to the User

Tell the user exactly what was scheduled:
- Task name
- What it does (1 sentence)
- Frequency and time
- When the first run will happen (nextRunAt from the response)
- "You can pause or change this anytime — just tell me."

## FREQUENCY GUIDE

| User says | Use this frequency | Default time |
|-----------|-------------------|--------------|
| "every morning" | daily | 09:00 |
| "every day" | daily | 09:00 |
| "twice a day" | Create TWO daily tasks (AM + PM) | 09:00 + 17:00 |
| "every hour" | hourly | :00 |
| "every few minutes" | every_10_min | N/A |
| "during business hours" | weekdays | 09:00 |
| "every Monday" | weekly | 09:00 |
| "first of the month" | monthly | 09:00 |
| "constantly" / "always" | every_10_min or every_30_min | N/A |

## COMMON TASK TEMPLATES

### Daily Blog Post
```
name: "Daily Blog Post"
taskType: "content"
frequency: "daily"
runTime: "08:00"
instruction: "1. Load skill: blog-content. 2. Pick today's topic from weekly rotation [Mon: AI/automation trends, Tue: small business growth tips, Wed: marketing strategies, Thu: hiring and staffing, Fri: customer experience]. 3. Generate hero image with image_generate. 4. Write 600-800 word blog post with Inter font headings, soft-sell Bloomie CTA. 5. Save as CRM draft via ghl_create_blog_post. 6. Save artifact backup. 7. Notify owner: 'Blog ready for review: [title]'. If any step fails, notify owner with exact error."
```

### Daily Blog Announcement Email
```
name: "Daily Blog Email"
taskType: "email"
frequency: "daily"
runTime: "10:00"
instruction: "1. Load skill: email-creator. 2. Check today's blog post (ghl_list_blog_posts, most recent). 3. Generate email hero image. 4. Write blog announcement email with link to the post, 3 key takeaways, Bloomie CTA. 5. Save as CRM email draft via ghl_create_email_template. 6. Save artifact backup. 7. Notify owner: 'Blog announcement email ready: [subject]. Review in CRM drafts.' Do NOT send without approval."
```

### Hourly Email Monitor
```
name: "Hourly Inbox Check"
taskType: "monitoring"
frequency: "hourly"
instruction: "1. Check Gmail inbox for new unread messages (last hour). 2. For each new message: summarize sender, subject, and key content in 1-2 sentences. 3. Flag urgent messages (from VIP contacts, containing 'urgent', 'asap', payment issues). 4. If urgent messages found: notify owner via SMS immediately with summary. 5. If only routine messages: compile a brief digest and save as a note. 6. If no new messages: do nothing (don't notify for empty inbox)."
```

### Weekly Performance Report
```
name: "Weekly Business Report"
taskType: "reporting"
frequency: "weekly"
runTime: "09:00"
instruction: "1. Pull CRM metrics: new contacts this week, pipeline value, emails sent, tasks completed. 2. Check blog performance: posts published, any draft backlog. 3. Review scheduled task run history for failures or issues. 4. Compile into a brief report (200-300 words). 5. Save as artifact. 6. Notify owner via email with the full report. Subject: 'Your Weekly BLOOM Report — [date range]'."
```

### Lead Follow-up
```
name: "New Lead Follow-up"
taskType: "followup"
frequency: "every_30_min"
instruction: "1. Search CRM for contacts created in the last 30 minutes with no outreach. 2. For each new lead: check their source, tags, and any notes. 3. Send a personalized welcome SMS via ghl_send_message introducing yourself and asking how you can help. 4. Tag contact as 'initial-outreach-sent'. 5. Log the outreach in contact notes. 6. If more than 3 new leads found, notify owner: '[X] new leads reached out to in the last 30 min.'"
```

## MANAGING EXISTING TASKS

When the user asks to change or stop a task:

1. Call `bloom_list_scheduled_tasks` first
2. Show them their tasks in a clear format
3. Use `bloom_clarify` to confirm which task and what change
4. Execute with `bloom_update_scheduled_task` (for changes/pause) or `bloom_delete_scheduled_task` (for permanent removal)
5. Confirm the change

**Pausing vs Deleting:**
- Default to PAUSE (`enabled: false`) — this preserves the task for later
- Only DELETE if the user explicitly says "remove it", "get rid of it", "delete it"
- Always confirm before deleting: "I'll permanently remove this task. Are you sure? I can also just pause it instead."

## CRITICAL RULES

1. **NEVER fake a successful schedule.** If `bloom_schedule_task` returns an error, tell the user the exact error. Don't say "Done!" when it failed.
2. **ALWAYS clarify first.** A vague "do this daily" needs specifics before you schedule it.
3. **ALWAYS check for duplicates.** Don't create 5 copies of "Daily Blog Post."
4. **Instructions must be self-contained.** The heartbeat engine executes them cold — no conversation context is available.
5. **Include error handling in every instruction.** "If X fails, notify owner with the error."
6. **Include notification in every instruction.** The user should know when a task ran and what happened.
7. **Test-friendly instructions.** Write them so they work on the very first execution without any prior state.
