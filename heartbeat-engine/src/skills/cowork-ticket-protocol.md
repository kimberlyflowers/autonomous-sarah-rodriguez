# BLOOM Autonomous Ticket Protocol

> This skill defines how Cowork (Claude) should handle incoming BLOOM tech tickets
> that arrive via the Supabase webhook. Follow these rules exactly.

---

## Session Start Behavior

When a Cowork session starts, **immediately check for open tickets**:

1. Call `bloom_get_tickets` to list all tickets with `status = open`.
2. If open tickets exist, triage them using the priority rules below.
3. Begin working on the highest-priority ticket first.
4. If no open tickets exist, report "No open BLOOM tickets" and stand by.

---

## Priority Rules

Triage every ticket by **severity**, then by **category**. Work tickets in this order:

| Priority | Severity  | Action                                         |
|----------|-----------|-------------------------------------------------|
| P0       | critical  | Fix immediately — drop everything else           |
| P1       | high      | Fix next — queue behind any active P0            |
| P2       | medium    | Fix when no P0/P1 tickets remain                 |
| P3       | low       | Fix when idle or batch with other P3s             |

Within the same severity, use category to break ties:

1. `infrastructure` — service down, DNS, SSL, deploy failures
2. `integration`    — API connections, webhooks, third-party services
3. `bug`            — application errors, data issues
4. `feature`        — enhancements, new capabilities
5. `help_needed`    — Bloomie asking Claude a question (Component 4)

---

## Fix Execution Rules

For each ticket you work on:

1. **Read the ticket** — call `bloom_get_ticket_detail` to get full context including
   `description`, `error_message`, `affected_task`, and `category`.

2. **Diagnose** — use available tools (bloom-ops-mcp, logs, code inspection) to
   identify the root cause. Document your diagnosis before acting.

3. **Fix** — apply the fix using the appropriate tools:
   - **Infrastructure**: use Railway tools (restart service, check domains, read logs)
   - **Code bugs**: use GitHub tools (read file, create branch, update file)
   - **Integration**: check API connections, env vars, webhook configs
   - **DNS/SSL**: use Namecheap tools (when available) + Railway domain tools

4. **Verify** — confirm the fix worked:
   - Check service health (`bloom_get_health`)
   - Read fresh logs (`bloom_tail_logs`)
   - Test the affected functionality if possible

5. **Resolve** — call `bloom_resolve_ticket` with:
   - A clear `resolution` description of what was wrong and what you did
   - Set `resolved_by` to `"cowork-claude"`

6. **Log** — the webhook endpoint automatically logs to `action_log`, but add
   a follow-up log entry with the resolution details if the action_log table is
   available.

---

## Escalation Rules

**Escalate to a human (Kimberly) when ANY of these are true:**

- The fix requires **new credentials** you don't have (API keys, tokens, passwords)
- The fix requires **payment** or **billing changes**
- The fix requires **Namecheap DNS changes** and Namecheap tools are not yet available
- You've attempted a fix **twice** and it still fails
- The ticket severity is `critical` AND you cannot diagnose the root cause within 5 minutes
- The ticket involves **data loss** or **security concerns**
- The ticket explicitly says "escalate" or "human needed"

**How to escalate:**

1. Update the ticket status to `escalated` using `bloom_update_ticket_status`
2. Add a clear note in the ticket description explaining:
   - What you tried
   - Why it needs human intervention
   - What the human needs to do
3. Notify via the Cowork session (the human will see it in the UI)

---

## Ticket Categories Reference

| Category         | Description                                    | Typical Tools            |
|------------------|------------------------------------------------|--------------------------|
| `infrastructure` | Server, hosting, deploy, DNS, SSL issues       | Railway, Namecheap       |
| `integration`    | API, webhook, third-party service failures     | Railway env, logs, code  |
| `bug`            | Application errors, logic issues, data bugs    | GitHub, logs             |
| `feature`        | New capabilities, enhancements                 | GitHub, code             |
| `help_needed`    | Bloomie question for Claude (bloom-ask flow)   | Anthropic API            |

---

## Autonomous Loop Behavior

When running autonomously (no human in the session):

1. Process tickets in priority order
2. Never skip a higher-priority ticket to work on a lower one
3. If blocked on one ticket, move to the next and come back
4. After resolving all tickets, check once more for new arrivals
5. If no tickets remain, the session can idle or end

---

## Safety Rules

- **Never delete production data** without explicit human approval
- **Never change DNS records** without human approval (until Namecheap tools are verified)
- **Never restart services** during peak hours (9 AM - 5 PM ET) unless severity is critical
- **Always create a branch** for code changes — never push directly to `main` without review
- **Log everything** — every action should be traceable in action_log
