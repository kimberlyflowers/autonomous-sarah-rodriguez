---
name: ghl-crm
description: "Expert GoHighLevel CRM operations that treat every contact like a relationship, not a row in a database. Use when the task involves contacts, leads, pipelines, deals, appointments, workflows, SMS/email sending via GHL, form submissions, invoices, or any CRM-related operation. Also triggers when the user mentions GHL, GoHighLevel, contacts, leads, pipeline, follow-up, or asks about their CRM data."
---

# GoHighLevel CRM Operations

## How to Think About This

The CRM is not a database. It's the institutional memory of every relationship the business has. Every note you write, every tag you add, every task you create — someone is going to read that tomorrow and use it to have a real conversation with a real person.

Write notes like someone who's never met this contact will read them. Tag contacts like you're building a filing system for the next 5 years. Create tasks like the person receiving them has 50 other things to do and needs YOUR task to tell them exactly what to do and why.

## The Golden Rules

### 1. Always Search Before Creating
Parents fill out forms multiple times. People call and text from different numbers. ALWAYS search by name AND email AND phone before creating a contact. Duplicates mean two people might reach out to the same lead — that's embarrassing and amateurish.

### 2. Every Contact Gets a Next Step
A contact without an active automation OR an assigned task is a dying lead. After every interaction, ask: "What happens next for this person?" If the answer is "nothing" — something is wrong.

### 3. Speed Matters, But Timing Matters More
Create the contact instantly. Trigger the welcome sequence instantly. But DON'T call a parent at 9pm because they filled out a form. Schedule the human follow-up for 10am the next business day, with full context in the task description.

### 4. Personalization Is Not Optional
"Dear Parent" is a death sentence. Every message uses their first name. Every follow-up references what they told you. "Angela, you mentioned Mateo is in 4th grade — our 3rd-5th grade class would be perfect for him" is the difference between a bounce and an enrollment.

## Contact Creation — Do It Right

When creating a contact, include ALL of this:

**Required fields:**
- First name, last name
- Phone (E.164 format: +12105550147)
- Email
- Source (where they came from: "SABWB Mixer March 2026", "Website Form", "Referral from [Name]")

**Tags (be specific and consistent):**
- Lead type: `parent-lead`, `donor-lead`, `partner-lead`
- Source tracking: `sabwb-mixer-march-2026`, `website-form`, `referral`
- Interest: `school-choice-interested`, `summer-program`, `enrollment-fall-2026`
- Status: `visit-requested`, `visit-completed`, `application-started`
- Demographic: `grade-4`, `grade-7`, `multiple-children`

Tag naming convention: lowercase, hyphenated, specific. `summer-camp-2025` not `Summer Camp` or `summercamp` or `SC25`.

**Contact note (always add one):**
Write a note that tells the STORY, not just the data:

Bad: "New lead from mixer."
Good: "Angela attended the SABWB mixer (March 2026). Her son Mateo is in 4th grade, currently at [school name]. She's interested in School Choice options and asked specifically about visiting the campus. Warm lead — came looking for alternatives. Next step: schedule campus visit."

## Pipeline Management

### Stage Names Should Be Action-Oriented
- New Lead → Contacted → Visit Requested → Visit Scheduled → Visit Completed → Application Started → Enrolled
- NOT: "Stage 1" → "Stage 2" → "Stage 3" (meaningless)

### Every Deal Gets a Value
Even estimated. $7,500 annual tuition gives leadership a revenue pipeline view. Without values, the pipeline is just a list.

### Move Deals Promptly
A deal sitting in "Contacted" for 3 weeks signals neglect. Either move it forward (they responded) or flag it (they didn't). Stale deals in early stages are the #1 pipeline health problem.

### Monthly Pipeline Review
On the 1st of every month, generate:
- Count per stage
- Stale leads (>14 days no activity)
- Action items for each stale lead
- Total pipeline value
- Comparison to last month

Don't just report numbers — create follow-up tasks for every action item.

## Communication Rules

### SMS
- Short, personal, conversational. Max 2-3 sentences.
- "Hey Angela, this is Sarah from YES. Just wanted to make sure you got our email about scheduling a visit. Any questions I can help with?"
- Send between 10am-7pm local time only.
- Never mass text without explicit approval.

### Email
- Professional but warm. Always include subject line.
- Reference something specific about them (their child's name, how they found you, what they asked about).
- One CTA per email.

### Before Any Communication
- Check the conversation history FIRST. Don't repeat what someone else already said.
- Read the contact notes. Don't ask them something they already told you.
- Check what automations are currently running. Don't manually send an email if the welcome sequence already covers it.

## Handling Failures and Angry Contacts

When a lead falls through the cracks (and it will):

1. **Check the full history.** What actually happened? Form submitted when? Sequence sent? Tasks created? Completed?
2. **Own it honestly.** "I owe you an apology. You took the time to reach out and we didn't follow through the way you deserved."
3. **Offer to make it right.** "Can I have someone call you today? Not a sales pitch — just a conversation."
4. **Escalate internally.** Flag the failure to leadership with a specific recommendation.
5. **Fix the process.** Add a note documenting what broke and create a task to audit the workflow.

Never argue. Never make excuses. Never say "we sent you an email" when they're telling you they felt ignored. Empathy first, process fix second.

## Workflow Automation

- **Welcome sequence:** Trigger on `parent-lead` tag. Email 1 immediate, Email 2 day 2, Email 3 day 5.
- **Visit follow-up:** Trigger on `visit-completed` tag. Thank-you email + "ready for next steps?" at day 3.
- **Re-engagement:** Trigger on 30-day inactivity. Personal check-in, not a template blast.
- **Always test workflows** with a test contact first. One broken automation can send gibberish to your entire list.

## Task Creation Best Practices

Bad task: "Follow up with Angela"
Good task: "Call Angela Torres — SABWB mixer lead, interested in School Choice + campus visit for son Mateo (4th grade). She's warm — came looking for alternatives. Reference her interest in School Choice funding."

Include: WHO, WHY they're in the system, WHAT to talk about, and WHAT the goal of the interaction is. The person receiving this task should be able to make the call without looking anything up.

## Data Quality

- Phone: always E.164 format (+1XXXXXXXXXX)
- Email: verify format before saving (no spaces, has @ and domain)
- Tags: lowercase, hyphenated, consistent
- Merge duplicates when found (keep the record with more history)
- Never delete a contact — archive them. Deleted data is gone forever.

## Common Mistakes to Avoid

- Creating contacts without checking for duplicates
- Leaving contacts with no next step (no automation, no task)
- Generic notes that don't tell the story ("new lead" is useless)
- Calling or texting outside business hours
- Not checking conversation history before reaching out
- Pipeline deals sitting in early stages for weeks with no movement
- Monthly reports that list numbers without action items
- Arguing with upset contacts instead of empathizing
- Mass messages without approval
- Inconsistent tag naming (mixing formats destroys segmentation)
