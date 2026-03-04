---
name: ghl-crm
description: "Expert GoHighLevel CRM operations that treat every contact like a relationship, not a row in a database. Use when the task involves contacts, leads, pipelines, deals, appointments, workflows, SMS/email sending via GHL, form submissions, invoices, or any CRM-related operation. Also triggers when the user mentions GHL, GoHighLevel, contacts, leads, pipeline, follow-up, or asks about their CRM data."
---

# GoHighLevel CRM Operations

## How to Think About This

The CRM is not a database. It's the institutional memory of every relationship the business has. Every note you write, every tag you add, every task you create — someone is going to read that tomorrow and use it to have a real conversation with a real person.

Write notes like someone who's never met this contact will read them. Tag contacts like you're building a filing system for the next 5 years. Create tasks like the person receiving them has 50 other things to do and needs YOUR task to tell them exactly what to do and why.

Always check memory and Company Skills for the client's specific CRM workflows, tag conventions, pipeline stages, and communication preferences before taking action.

## The Golden Rules

### 1. Always Search Before Creating
People fill out forms multiple times. Always search by name AND email AND phone before creating a contact. Duplicates mean two people might reach out to the same lead.

### 2. Every Contact Gets a Next Step
A contact without an active automation OR an assigned task is a dying lead. After every interaction, ask: "What happens next for this person?" If the answer is "nothing" — something is wrong.

### 3. Speed Matters, But Timing Matters More
Create the contact instantly. Trigger automations instantly. But schedule human follow-ups for business hours with full context in the task description.

### 4. Personalization Is Not Optional
Every message uses their first name. Every follow-up references what they told you. Generic greetings are a death sentence for conversion.

## Contact Creation — Do It Right

**Required fields:**
- First name, last name
- Phone (E.164 format: +1XXXXXXXXXX)
- Email
- Source (exactly where they came from — not just "website" but "Website Form — Services Page" or "Referral from [Name]")

**Tags (be specific and consistent):**
- Lead type: descriptive of what they are (`buyer-lead`, `seller-lead`, `new-patient`, `parent-lead`)
- Source tracking: specific event or channel (`webinar-march-2026`, `google-ads`, `referral`)
- Interest: what they asked about (`interested-premium`, `asked-about-pricing`)
- Status: where they are in the journey (`consultation-requested`, `proposal-sent`)

Tag naming convention: always lowercase, always hyphenated, always specific. Never mix formats.

**Contact note (always add one):**
Bad: "New lead from website."
Good: "[Name] came through [specific source]. They're interested in [specific thing]. They mentioned [relevant context]. Next step: [specific action]."

The note should let someone make a warm call without looking anything else up.

## Pipeline Management

- **Stage names should be action-oriented:** "New Lead → Contacted → Consultation Booked → Proposal Sent → Won/Lost" — not "Stage 1, Stage 2, Stage 3"
- **Every deal gets a value.** Even estimated. This gives leadership a revenue pipeline view.
- **Move deals promptly.** Stale deals in early stages signal neglect.
- **Monthly pipeline review:** Count per stage, stale leads (>14 days no activity), action items for each, total pipeline value, comparison to last month. Don't just report numbers — create follow-up tasks.

## Communication Rules

### SMS
- Short, personal, conversational. Max 2-3 sentences.
- Send between 10am-7pm local time only.
- Never mass text without explicit approval.

### Email
- Professional but warm. Always include subject line.
- Reference something specific about them.
- One CTA per email.

### Before Any Communication
- Check conversation history FIRST. Don't repeat what someone else already said.
- Read contact notes. Don't ask something they already told you.
- Check what automations are running. Don't manually duplicate what a sequence already covers.

## Handling Failures and Angry Contacts

When a lead falls through the cracks:

1. **Check the full history.** What actually happened?
2. **Own it honestly.** "I owe you an apology. You took the time to reach out and we didn't follow through the way you deserved."
3. **Offer to make it right.** Give them a specific, easy next step.
4. **Escalate internally.** Flag the failure to the business owner with context and a recommendation.
5. **Fix the process.** Document what broke, create a task to audit the workflow.

Never argue. Never make excuses. Empathy first, process fix second.

## Task Creation Best Practices

Bad task: "Follow up with [Name]"
Good task: "Call [Name] — [source]. They're interested in [specific thing] and mentioned [context]. Goal: [specific outcome]."

The person receiving the task should be able to take action without looking anything up.

## Data Quality

- Phone: always E.164 format
- Email: verify format before saving
- Tags: lowercase, hyphenated, consistent
- Merge duplicates when found (keep the record with more history)
- Never delete — archive. Deleted data is gone forever.

## Common Mistakes to Avoid

- Creating contacts without checking for duplicates
- Contacts with no next step (no automation, no task)
- Generic notes that don't tell the story
- Communicating outside business hours
- Not checking history before reaching out
- Pipeline deals stagnating for weeks
- Reports that list numbers without action items
- Arguing with upset contacts instead of empathizing
- Inconsistent tag naming
- Not checking Company Skills for client-specific workflows before acting
