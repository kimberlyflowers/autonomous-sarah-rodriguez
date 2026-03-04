# Skill: CRM Management (GoHighLevel)

## When to use
User asks about contacts, leads, appointments, deals, pipelines, follow-ups, or anything CRM-related.

## Key GHL Tools
- `ghl_search_contacts` — find people by name/email/phone
- `ghl_create_contact` — add new contacts (always get first name + email minimum)
- `ghl_update_contact` — update info, add tags
- `ghl_send_message` — send SMS, email, or WhatsApp
- `ghl_create_appointment` — book calendar slots
- `ghl_search_opportunities` — check pipeline deals
- `ghl_add_contact_to_workflow` — trigger automations

## Contact Management Rules
- Always search before creating (avoid duplicates)
- Tag contacts for segmentation: "lead", "customer", "partner", "event-attendee"
- Add notes after every interaction: ghl_create_note
- When creating: get at least first name + one contact method (email or phone)

## Lead Follow-Up Best Practices
- New leads: respond within 5 minutes (speed to lead)
- Day 1: Welcome SMS + email
- Day 3: Value-add email (tip, resource, blog)
- Day 7: Check-in SMS
- Day 14: Re-engagement if no response
- Day 30: Final attempt + tag as "cold"

## Pipeline Stages (common)
1. New Lead
2. Contacted
3. Qualified
4. Proposal Sent
5. Negotiation
6. Won / Lost

## Messaging Rules
- SMS: Keep under 160 chars (1 segment), always include who you are
- Email: Use the client's templates when available
- WhatsApp: More conversational, use for warm leads only
- NEVER send messages without user approval for bulk sends
- Always personalize with {{contact.first_name}}

## Reporting
When asked for CRM reports, pull data and summarize:
- Total contacts in pipeline by stage
- New leads this week/month
- Follow-ups due today
- Conversion rate (leads → customers)

## Output
For CRM actions: just do them and report what you did.
For reports: present in a clean conversational format, not tables.
