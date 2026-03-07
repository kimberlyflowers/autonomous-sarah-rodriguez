---
name: lead-scraper
description: "Build targeted lead lists by scraping public web directories, company pages, and professional databases. Triggers for: 'find leads', 'build a list', 'scrape contacts', 'prospect list', 'financial advisors', 'find emails', 'lead generation', 'contact list', 'prospect', 'directory', 'NAPFA', 'FINRA', 'CFP', 'RIA', 'chamber of commerce', or any request to find and compile business contacts from the web. Sarah will navigate public sources, extract structured contact data, and import into BLOOM CRM automatically."
---

# Lead Scraper Skill — AI Employee Standard

Sarah can autonomously build targeted lead lists from public web sources using her browser. She extracts names, titles, emails, phones, and company info — then pushes directly into BLOOM CRM for outreach.

## Core Workflow

1. **Understand the target** — Who are we looking for? Industry, title, location, company size
2. **Select best sources** — Choose directories most likely to have verified contacts
3. **Scrape systematically** — Navigate, paginate, extract, repeat
4. **Deduplicate** — Never create duplicate contacts
5. **Import to CRM** — Push all leads into GHL with proper tags
6. **Report results** — Tell the user exactly how many leads were found and added

## Best Public Sources by Industry

### Financial Advisors / Wealth Management
- **NAPFA** (`napfa.org/find-an-advisor`) — Fee-only financial planners, searchable by zip/state
- **FINRA BrokerCheck** (`brokercheck.finra.org`) — Licensed advisors, fully public
- **CFP Board** (`cfp.net/find-a-cfp-professional`) — Certified Financial Planners by location
- **XY Planning Network** (`xyplanningnetwork.com/members`) — 1,800+ fee-only planners
- **NAPFA Search** returns name, firm, city, state, phone, website

### General Business / Local
- Chamber of commerce directories (search `[city] chamber of commerce member directory`)
- Google Maps (`maps.google.com`) — search by business type + location
- Better Business Bureau (`bbb.org`) — searchable by category + location
- LinkedIn company pages (public data only — no login required for basic info)

### Real Estate
- NAR member directory (`nar.realtor`)
- State association directories

### Healthcare / Medical
- NPI Registry (`npiregistry.cms.hhs.gov`) — all licensed providers, fully public API
- State medical board directories

## `scrape_leads` Tool Usage

Use `scrape_leads` for all lead generation tasks. It handles browser navigation, extraction, pagination, and CRM import automatically.

```
scrape_leads({
  source_url: "https://www.napfa.org/find-an-advisor",
  target_description: "fee-only financial advisors in Texas",
  search_params: { state: "TX" },
  max_leads: 100,
  fields_to_extract: ["name", "firm", "city", "state", "phone", "website", "email"],
  crm_tags: ["lead:financial-advisor", "source:napfa", "state:tx"],
  campaign: "AI Employees - Save 15 Hours"
})
```

## Extraction Rules

- **Always extract**: name, company/firm, city, state
- **Extract when available**: email, phone, website, title/role
- **Never fabricate** contact info — only record what's actually on the page
- **Email inference**: If a website is found, Sarah can attempt `info@domain.com` or check the contact page — but flag inferred emails clearly with tag `email:inferred`
- **Phone formatting**: Normalize all to `(xxx) xxx-xxxx` format

## CRM Import Standards

When adding leads to GHL, always:
- Tag with `source:[directory-name]` (e.g. `source:napfa`, `source:cfp-board`)
- Tag with `lead:[industry]` (e.g. `lead:financial-advisor`)
- Tag with `campaign:[campaign-name]` if tied to an outreach campaign
- Tag with `state:[xx]` for geographic filtering
- Set custom field `Lead Source` = directory name
- **Search before creating** — skip if contact already exists by email or phone
- Report total: new contacts added, skipped duplicates, failed imports

## Pagination Handling

Most directories paginate. Sarah must:
1. Detect pagination controls (Next button, page numbers, load more)
2. Extract all leads from current page
3. Navigate to next page
4. Repeat until `max_leads` reached OR no more pages
5. Track progress and report estimated completion time for large lists

## Rate Limiting & Politeness

- Wait 2–3 seconds between page navigations (avoid getting blocked)
- If a site blocks or returns CAPTCHA, stop and report — do not retry aggressively
- Prioritize sources that are more scraper-friendly (NAPFA, CFP Board are very open)
- LinkedIn requires login and blocks scrapers — use only for manual research, not bulk scraping

## Scheduled Nightly Scraping

When running as a scheduled task:
- Run between 1:00 AM – 4:00 AM Central time
- Target 50–200 new leads per night (sustainable, avoids detection)
- Rotate sources each night (Monday: NAPFA, Tuesday: CFP Board, Wednesday: XYZ, etc.)
- Send a morning summary report to the owner with leads added, source used, CRM tags applied
- Skip nights where CRM already has >500 uncontacted leads (avoid overflow)

## Output Format

After completing a scraping run, always report:
```
✅ Lead Scrape Complete
Source: NAPFA Directory (Texas)
New leads added: 47
Skipped (duplicates): 3
Failed imports: 1
CRM tags applied: lead:financial-advisor, source:napfa, state:tx
Next step: Ready for email campaign — want me to draft the outreach sequence?
```
