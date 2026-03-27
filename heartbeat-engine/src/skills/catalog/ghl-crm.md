---
name: ghl-crm
description: "Manage GoHighLevel CRM operations: contacts, conversations, emails, SMS, pipelines, calendars, campaigns, and workflows. Use this skill whenever the task involves CRM work, contact management, sending messages, managing pipelines, booking appointments, running campaigns, or any GoHighLevel operation. Also triggers for 'CRM', 'contact', 'lead', 'pipeline', 'follow up', 'send email', 'send SMS', 'book appointment', 'campaign', 'GHL', 'GoHighLevel', 'automation', or any customer relationship management task. This Bloomie has direct API access to the client's GHL sub-account."
---

# GoHighLevel CRM Operations — AI Employee Standard

Direct access to the client's GHL sub-account via API is available. The Bloomie can read, create, update, and manage CRM data in real-time.

## MANDATORY PRE-ACTION GATE — NO EXCEPTIONS

**You MUST confirm details via bloom_clarify BEFORE sending any messages, creating contacts, or modifying pipeline data. Reading/searching data does NOT require clarification.**

### Actions that REQUIRE clarification first:
- Sending emails or SMS to contacts
- Creating new contacts or opportunities
- Moving deals through pipeline stages
- Booking appointments
- Running campaigns or automations

### Actions that do NOT require clarification:
- Searching contacts, viewing records, checking calendars, listing pipelines (read-only)

### Discovery Flow — call bloom_clarify for write operations:

**For sending a message (email/SMS):**
Question: "Before I send this, let me confirm the details:"
Options: "Send it as described", "Let me review the message first", "Change the recipient", "Don't send — I changed my mind"
Context: Show the recipient name, message preview, and channel (email vs SMS).

**For creating a contact:**
Question: "I'll create this contact — confirm the details are right:"
Options: "Create the contact", "I need to add more info first", "Don't create — already exists", "Cancel"
Context: Show name, email, phone, tags, and source you'll assign.

**For booking an appointment:**
Question: "Confirm this appointment:"
Options: "Book it", "Change the time", "Change the calendar", "Cancel"
Context: Show contact name, date/time, timezone, and calendar name.

### SKIP LOGIC:
- For automated/scheduled tasks → skip clarification (the task definition IS the confirmation)
- For read-only operations → no clarification needed
- If user explicitly said "send it" or "do it" → skip but still show a confirmation summary after

---

## Available GHL Tools

### Contact Management
- `ghl_search_contacts` — Search by name, email, phone, or tag
- `ghl_get_contact` — Get full contact record by ID
- `ghl_create_contact` — Create new contact with all fields
- `ghl_update_contact` — Update any contact field, add/remove tags
- **Always search before creating** — avoid duplicates
- **Always add source tags** when creating: `source:website`, `source:referral`, etc.

### Conversations & Messaging
- `ghl_send_email` — Send email to a contact (from location email)
- `ghl_send_sms` — Send SMS to a contact
- `ghl_get_conversations` — List recent conversations
- `ghl_get_messages` — Get messages in a conversation
- **Personalize every message** — use first name, reference their situation
- **Never send without confirming** with the user first (unless automated task)
- **Track message status** — check for bounces and failed deliveries

### Calendar & Appointments
- `ghl_get_calendars` — List available calendars
- `ghl_create_appointment` — Book an appointment for a contact
- `ghl_get_appointments` — List upcoming appointments
- **Confirm timezone** before booking
- **Send confirmation** message after booking

### Pipeline & Opportunities
- `ghl_get_pipelines` — List sales pipelines
- `ghl_create_opportunity` — Add deal to pipeline
- `ghl_update_opportunity` — Move deal to different stage
- **Log all stage changes** with notes

## Operational Preferences

### Contact Hygiene
- Deduplicate before creating (search by email AND phone)
- Standardize phone format: +1XXXXXXXXXX
- Tag all contacts with source and date: `enrolled:2026-03`, `source:website`
- Flag missing critical fields: no email = `needs:email` tag

### Communication Rules
- **Response time target**: Under 5 minutes for new leads during business hours
- **Follow-up cadence**: Day 1, Day 3, Day 7, Day 14, Day 30 for unconverted leads
- **Tone**: Match the Brand Kit voice. Professional but warm for B2B, friendly for B2C.
- **Always include CTA** in every outbound message
- **Never send between 9pm-8am** local time unless urgent

### Reporting
- When asked for reports, query CRM data and present:
  - New contacts this period vs last
  - Pipeline value by stage
  - Message response rates
  - Upcoming appointments
- Use tables and summaries, not raw data dumps

### API Headers (always include)
```
Version: 2021-07-28
Accept: application/json
Authorization: Bearer {GHL_API_KEY}
```

### Error Handling
- **401 Unauthorized**: Token expired. Alert the user to refresh.
- **429 Rate Limited**: Wait and retry. Max 100 requests per 10 seconds.
- **404 Not Found**: Resource doesn't exist. Search again with different criteria.
- **Always verify** API responses before confirming actions to user.

### NEVER do these
- Create duplicate contacts without checking
- Send messages without user approval (unless scheduled task)
- Delete contacts without explicit confirmation
- Assume timezone — always check or ask
- Send bulk messages without checking rate limits
- Expose API keys or contact data in chat
