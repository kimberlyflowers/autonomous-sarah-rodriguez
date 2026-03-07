---
name: lead-scraper
description: "Autonomous lead list building from public web directories using the browser. Load this skill whenever anyone asks to: find leads, build a contact list, get prospects, find financial advisors, find emails, pull contacts, scrape a directory, 'build me a list of X', 'find X in Y city', or any request to gather real people's contact info from the web. Even casual phrasing like 'who are the CFPs in Texas' or 'look up advisors near me' — if the end goal is a list of real contacts, load this skill immediately before doing anything else."
---

# Lead Scraper Skill

You build lead lists by actually navigating websites with your browser tools — not by explaining how it could be done. This skill gives you everything you need to do it correctly and fast.

## How to think about this job

You are a researcher sitting at a computer. Your job is: open a directory website, search for the target audience, read the results, click Next, repeat, compile the list, import to CRM. Your browser tools are your hands. `scrape_leads` is the fast path. `browser_task` is the fallback when the fast path fails or when a site needs form interaction.

**The moment a user asks for leads — your first action is a tool call. Not a sentence. A tool call.**

---

## Step 1: Load this skill first, then immediately call `scrape_leads`

Example — user says "find 10 financial advisor leads from NAPFA in Texas":

```javascript
scrape_leads({
  source_url: "https://www.napfa.org/find-an-advisor",
  target_description: "fee-only financial advisors in Texas",
  search_params: { state: "TX" },
  max_leads: 10,
  crm_tags: ["lead:financial-advisor", "source:napfa", "state:tx"],
  import_to_crm: true
})
```

No preamble. No "I'll now search for...". Just call the tool.

---

## Step 2: If `scrape_leads` returns 0 results or an error — fall back to `browser_task`

Write your task instruction as if you're describing exactly what a human would do step-by-step:

```javascript
browser_task({
  task: `Go to https://www.napfa.org/find-an-advisor.
Find the state filter or search form. Select or type "Texas".
Click the Search or Find button. Wait for advisor cards to appear.
For each advisor listed extract: full name, firm name, city, state, phone number, website URL, email if shown.
Then click "Load More" or the Next Page button and repeat until you have 10 results.
Return all results as a structured list with one advisor per line.`,
  url: "https://www.napfa.org/find-an-advisor",
  max_steps: 35
})
```

**Why specificity matters in `browser_task`:** Vague instructions like "find financial advisors" will cause the agent to wander. Concrete instructions like "click the state dropdown, select Texas, wait for .advisor-card elements to appear, extract the text inside each" give the browser agent a clear path to follow.

---

## Best Sources by Industry

### Financial Advisors

| Source | URL | Scraper-friendliness | Best for |
|---|---|---|---|
| **NAPFA** | `https://www.napfa.org/find-an-advisor` | ⭐⭐⭐ Very open | Fee-only planners, searchable by state |
| **CFP Board** | `https://www.cfp.net/find-a-cfp-professional` | ⭐⭐ Needs form fill | CFP-certified, search by zip + radius |
| **XY Planning Network** | `https://www.xyplanningnetwork.com/members` | ⭐⭐⭐ Clean HTML | Fee-only, Gen X/Y focus, URL pagination |
| **SEC IAPD** | `https://www.adviserinfo.sec.gov` | ⭐⭐ API available | RIA firms, SEC explicitly allows automation |
| **FINRA BrokerCheck** | ❌ DO NOT USE | Blocked | ToS explicitly prohibits automated scraping |

**Start with NAPFA.** It's the most scraper-friendly and returns the cleanest data.

### General Business
- **Google Maps**: `browser_task({ task: "Search Google Maps for [business type] in [city, state]. For each listing extract: business name, address, phone, website. Get at least 20 results by scrolling down.", url: "https://maps.google.com" })`
- **BBB**: `https://www.bbb.org/search` — filter by category + location
- **Chamber of Commerce**: Search web for `[city] chamber of commerce member directory` and scrape the results page

### Healthcare
- **NPI Registry**: `https://npiregistry.cms.hhs.gov/search` — fully public, all licensed providers, no ToS restrictions. Search by taxonomy code + state.

---

## Handling Common Errors

**Page loads but no results appear**
Most directories render results with JavaScript after a search form is submitted. In `browser_task`, always include: "Wait for the results to load before extracting" or "Wait until advisor cards are visible."

**Selector doesn't match anything**
Fall back to full-page text extraction: `scrape_page_content({ url: currentUrl, extract_contacts: true })` — this pulls all emails and phones directly from the page without needing specific selectors.

**CAPTCHA appears**
Stop immediately. Report to the user: "Hit a CAPTCHA on [site]. I can try a different source or you can solve it manually and I'll continue from there." Do not retry aggressively — this causes IP bans.

**Site blocks the request (403 / blank page)**
Try a different source from the table above. Note in your report which source was blocked.

**Pagination stops early**
Some directories load results dynamically on scroll rather than using a Next button. In `browser_task` add: "Scroll to the bottom of the page slowly, wait 1 second, scroll again, then extract results."

---

## Anti-Detection Best Practices

These are already applied in the browser service, but understand why they matter so you can work with them:

- **2–3 second delay between pages** — mimics human reading speed, avoids rate limiting
- **Images/fonts/media blocked** — makes pages load 60–80% faster without affecting text content
- **User agent set to real Chrome** — prevents the most basic bot detection
- **One page at a time** — never request multiple pages simultaneously

For sites with aggressive detection (Cloudflare, DataDome): use `browser_task` instead of `scrape_leads` — the sidecar browser has additional stealth capabilities.

---

## CRM Import Standards

Every lead imported to GHL must have:
- `source:[directory-name]` tag (e.g. `source:napfa`)
- `lead:[industry]` tag (e.g. `lead:financial-advisor`)
- `state:[xx]` tag for geographic filtering (e.g. `state:tx`)
- `campaign:[name]` tag if tied to an outreach campaign
- Search for existing contact by email before creating — skip if duplicate

**Never fabricate contact info.** Only record what's actually on the page. If an email isn't listed but a website is, tag with `email:missing` and note the website — the owner can follow up.

---

## Nightly Scheduled Scraping Protocol

When running as a scheduled overnight task:
- **Run time**: 1:00 AM – 4:00 AM Central
- **Volume**: 50–150 leads per night (sustainable, avoids detection)
- **Source rotation**: Monday=NAPFA, Tuesday=CFP Board, Wednesday=XY Planning, Thursday=Google Maps, Friday=BBB or chamber directories
- **Skip if**: CRM already has >500 uncontacted leads with the same tags (no point flooding)
- **Morning report**: Send summary to owner — leads added, source used, tags applied, any errors, suggested next step

---

## Output Format

After every scraping run, report in this format:

```
✅ Lead Scrape Complete
Source: NAPFA Directory (Texas)
Pages scraped: 4
Leads extracted: 47
New contacts added to CRM: 44
Skipped (duplicates): 3
CRM tags: lead:financial-advisor, source:napfa, state:tx
Duration: 38s

Preview (first 3):
1. Jane Smith — Smith Financial, Austin TX — (512) 555-0100 — jsmith.com
2. Marcus Lee — Lee Wealth Mgmt, Dallas TX — (214) 555-0200 — leewm.com
3. Priya Patel — Patel Planning, Houston TX — (713) 555-0300 — (no email found)

Next step: Ready to draft outreach sequence — want me to set that up?
```
