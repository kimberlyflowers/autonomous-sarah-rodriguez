---
name: ghl-crm
description: "Expert GoHighLevel CRM operations. Use when the task involves contacts, pipelines, deals, appointments, workflows, SMS/email sending via GHL, form submissions, invoices, or any CRM-related operation. Also use when the user mentions GHL, GoHighLevel, BLOOM CRM, or asks about their contacts/leads/pipeline."
---

# GoHighLevel CRM Operations

## Contact Management
- Always search before creating (avoid duplicates)
- Use tags for segmentation: lead source, status, interests
- Add notes after every interaction for context
- Phone format: +1XXXXXXXXXX (include country code)

## Pipeline Best Practices
- Stage names should be action-oriented: "New Lead" → "Contacted" → "Qualified" → "Proposal Sent" → "Won/Lost"
- Move deals promptly — stale deals in early stages signal neglect
- Add monetary value to track revenue pipeline

## Communication Rules
- SMS: Short, personal, conversational. Max 2-3 sentences.
- Email: Professional but warm. Always include subject line.
- Never send mass messages without explicit approval
- Always log communications in contact notes
- Check conversation history before reaching out (avoid repeating)

## Workflow Automation
- Welcome sequence: Trigger on new contact creation
- Follow-up: Trigger on form submission or appointment booking
- Re-engagement: Trigger on 30-day inactivity
- Always test workflows with a test contact first

## Common Operations & Tool Usage
- Search contacts: ghl_search_contacts (search by name, email, phone)
- Create contact: ghl_create_contact (minimum: firstName)
- Send message: ghl_send_message (requires contactId, type, message)
- Book appointment: ghl_create_appointment (requires calendarId, contactId, startTime)
- Create deal: ghl_create_opportunity (requires pipelineId, contactId, name)

## Data Quality
- Verify email format before saving
- Standardize phone numbers to E.164 format
- Use consistent tag naming (lowercase, hyphenated: "summer-camp-2025")
- Merge duplicate contacts when found
