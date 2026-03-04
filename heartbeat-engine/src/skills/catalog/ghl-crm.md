---
name: ghl-crm
description: "Expert GoHighLevel CRM operations with a human touch. Use when the task involves contacts, pipelines, deals, appointments, workflows, SMS/email sending via GHL, form submissions, invoices, or any CRM-related operation. Also use when the user mentions GHL, GoHighLevel, BLOOM CRM, or asks about contacts, leads, or pipeline."
---

# GoHighLevel CRM Operations

## The Philosophy

A CRM is not a database. It's a relationship tracker. Every contact is a real person with real needs. When you interact with the CRM, you're managing relationships on behalf of the client — treat every contact as if the client would personally vouch for how they were handled.

## Contact Management

### Before Creating a Contact
1. **Search first.** Always search by name, email, AND phone before creating. Duplicate contacts create confusion and damage trust when a contact gets the same message twice.
2. **Verify the data.** Phone numbers must be E.164 format (+1XXXXXXXXXX). Check email format. Garbage in = garbage out.

### When Creating or Updating
- **Tags are everything.** Use them consistently. Lowercase, hyphenated: `new-intake`, `summer-camp-2025`, `donor-prospect`. Tags let the client segment and target. Bad tagging = useless CRM.
- **Notes tell the story.** After every interaction, add a note. Not just "called" — write "Called about summer enrollment, interested in the 8-12 age group, wants to bring her nephew too. Follow up Thursday." Future-you (or the client) will thank you.
- **Source tracking.** Always tag where the lead came from: `source-facebook`, `source-referral`, `source-walk-in`, `source-website`. This tells the client which marketing works.

## Pipeline & Deals

- Stage names should be action-oriented: "New Lead" → "Contacted" → "Qualified" → "Proposal Sent" → "Won/Lost"
- Move deals promptly. A deal sitting in "New Lead" for 2 weeks is a dead deal.
- Always add monetary value when relevant — this lets the client see their revenue pipeline.
- When a deal moves to "Lost," add a note explaining WHY. This data is gold for improving.

## Communication

### SMS
- Sound like a human. "Hey {firstName}, quick question — are you still interested in the summer program?" NOT "Dear valued customer, we are writing to inform you..."
- Max 2-3 sentences. Respect the medium.
- Always check conversation history before reaching out. Repeating yourself destroys trust.
- Never send mass messages without explicit client approval.

### Email
- Professional but warm. The client's brand voice should come through.
- Always include a subject line — emails without subjects look like spam.
- One clear purpose per email. Don't cram registration info, an event invite, and a donation ask into one email.

### When NOT to Communicate
- Don't text before 10am or after 7pm local time
- Don't send follow-ups more than 3 times without a response — move to a longer nurture sequence
- Don't communicate on behalf of the client about sensitive topics (financial, legal, health) without approval

## Workflow Automation

- **Welcome sequence:** Trigger on new contact creation. Immediate value delivery.
- **Follow-up:** Trigger on form submission or appointment booking.
- **Re-engagement:** Trigger on 30-day inactivity.
- **ALWAYS test workflows with a test contact first.** Sending a broken workflow to real contacts is embarrassing.

## Tool Reference

When executing CRM operations, use these tools:
- `ghl_search_contacts` — Search by name, email, phone. ALWAYS do this before creating.
- `ghl_create_contact` — Minimum: firstName. Always add tags and source.
- `ghl_update_contact` — Update fields, add tags. Preserve existing data.
- `ghl_send_message` — Requires contactId, type (sms/email), message. Check history first.
- `ghl_create_appointment` — Requires calendarId, contactId, startTime.
- `ghl_create_opportunity` — Requires pipelineId, contactId, name. Add monetaryValue.

## Quality Check

Before executing any CRM action:
- Did I search for duplicates first?
- Is the data clean? (Phone format, email valid, tags consistent)
- Did I check the contact's conversation history?
- Would the client be comfortable if they saw exactly what I'm doing?
- Am I adding enough context in notes for the next person who looks at this contact?
