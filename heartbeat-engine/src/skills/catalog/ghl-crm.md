---
name: ghl-crm
description: "Expert GoHighLevel CRM operations that treat every contact like a relationship. Use when the task involves contacts, leads, pipelines, deals, appointments, workflows, SMS/email sending via GHL, form submissions, invoices, or any CRM-related operation. Also triggers for GHL, GoHighLevel, contacts, leads, pipeline, follow-up, or CRM data."
---

# GoHighLevel CRM Operations

## How to Think About This

The CRM is not a database. It's the institutional memory of every relationship the business has. Every note, tag, and task — someone reads that tomorrow to have a real conversation with a real person.

Check memory and Company Skills for the client's specific workflows, tag conventions, pipeline stages, and communication preferences before any action.

## The Golden Rules

1. **Always search before creating.** Duplicates = embarrassing double outreach.
2. **Every contact gets a next step.** No automation AND no task = dying lead.
3. **Speed matters, timing matters more.** Create instantly. Call at 10am with context.
4. **Personalize everything.** Generic greetings kill conversion.

## Tool Usage Patterns

Sarah has these GHL tools available. Use the right one for each operation:

### Contact Operations
```
ghl_search_contacts → Search by name, email, or phone
  Input: { query: "Angela Torres" } or { email: "angela@email.com" } or { phone: "+12105550147" }

ghl_create_contact → Create new contact
  Input: { firstName, lastName, email, phone, tags: ["tag1","tag2"], source: "SABWB Mixer" }
  ALWAYS include: firstName, phone (E.164: +1XXXXXXXXXX), email, source, tags

ghl_update_contact → Update existing contact
  Input: { contactId: "abc123", tags: ["new-tag"], customFields: {...} }

ghl_add_note → Add note to contact
  Input: { contactId: "abc123", body: "Detailed context note" }
```

### Communication
```
ghl_send_message → Send SMS or email
  Input: { contactId, type: "sms"|"email", message: "text", subject: "for emails" }
  SMS: max 160 chars, personal tone, 10am-7pm only
  Email: include subject, professional but warm

ghl_send_email → Send formatted email
  Input: { contactId, subject, htmlBody, textBody }
```

### Pipeline
```
ghl_create_opportunity → Create deal in pipeline
  Input: { pipelineId, stageId, contactId, name: "Torres Family — Mateo (4th)", monetaryValue: 7500 }

ghl_update_opportunity → Move deal between stages
  Input: { opportunityId, stageId: "new-stage-id" }
```

### Calendar
```
ghl_create_appointment → Book appointment
  Input: { calendarId, contactId, startTime: "2026-03-10T10:00:00", title: "Campus Visit — Torres Family" }
```

### Workflow
```
ghl_add_to_workflow → Add contact to automation
  Input: { contactId, workflowId }
  Use for: welcome sequences, follow-up automations, re-engagement
```

## Contact Creation — Do It Right

**Always include:**
- First/last name
- Phone (E.164: +12105550147)
- Email
- Source (specific: "Website Form — Services Page" not just "website")
- Tags (see conventions below)

**Tag Conventions (always lowercase, hyphenated):**
- Lead type: `parent-lead`, `buyer-lead`, `seller-lead`, `new-patient`
- Source: `sabwb-mixer-march-2026`, `google-ads`, `referral-from-jones`
- Interest: `school-choice-interested`, `premium-plan`, `asked-about-pricing`
- Status: `visit-requested`, `visit-completed`, `proposal-sent`
- NEVER mix formats. Not "Summer Camp" or "summercamp" — always `summer-camp`

**Contact Notes (always add one):**
Bad: "New lead from website."
Good: "[Name] came through [specific source]. Interested in [specific thing]. Mentioned [context]. Next step: [action]."

## Pipeline Management

- Stage names: action-oriented. "New Lead → Contacted → Consultation Booked → Proposal Sent → Won/Lost"
- Every deal gets a monetary value (even estimated)
- Move deals promptly — stale >14 days signals neglect
- Monthly review: count per stage, stale leads, action items, total value

## Communication Rules

- Check conversation history FIRST. Don't repeat what someone said.
- Check running automations. Don't manually duplicate sequences.
- SMS: 2-3 sentences max, 10am-7pm only, personal tone
- Email: include subject, reference something specific about them
- Never mass message without explicit approval

## Handling Failures

When leads fall through cracks:
1. Check full history — what actually happened?
2. Own it: "I owe you an apology. You reached out and we didn't follow through."
3. Offer to make it right with a specific next step
4. Escalate to business owner with context
5. Fix the process — document what broke, create audit task

Never argue. Never make excuses. Empathy first.

## Task Creation

Bad: "Follow up with Angela"
Good: "Call Angela Torres — SABWB mixer lead, interested in School Choice + campus visit for son Mateo (4th). She's warm. Goal: schedule visit."

Include WHO, WHY, WHAT to discuss, and the GOAL.

## Data Quality

- Phone: E.164 (+1XXXXXXXXXX)
- Tags: lowercase-hyphenated always
- Merge duplicates (keep record with more history)
- Never delete — archive

## Common Mistakes

- Creating without searching for duplicates
- Contacts with no next step
- Generic notes
- Communicating outside business hours
- Not checking history before outreach
- Stale pipeline deals
- Reports without action items
- Inconsistent tag formats
