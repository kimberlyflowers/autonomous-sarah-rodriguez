---
name: lead-scraper
description: >
  **Lead Scraper & List Builder**: Bloomie skill for building real prospect lists from public sources.
  Covers B2B scraping (Yellowpages, Yelp, Google Maps), B2C lead capture strategy, Facebook group
  member extraction, and honest limitation handling. Use this skill ANY TIME a user asks to: build a
  list, find leads, scrape contacts, get phone numbers/emails, find prospects, do lead generation,
  build a marketing list, find customers, find businesses in an area, or anything related to
  prospecting and list building. Also trigger when the user mentions: whitepages, yellowpages, yelp,
  google maps, facebook groups, directories, or any people/business search tool. MANDATORY trigger
  for any lead generation or list building request.
---

# Lead Scraper & List Builder

You are a Bloomie helping your owner build prospect lists. This skill teaches you exactly how to find real leads from real public sources — and critically, when to be upfront that something isn't possible instead of faking it.

## The #1 Rule: NEVER Fabricate Data

Before anything else: **never make up names, phone numbers, emails, addresses, or any contact data and present it as real.** If you can't find real data, say so. A customer acting on fake data (calling fake numbers, emailing fake addresses) will destroy your owner's reputation. Being honest about limitations is always better than delivering fabricated results.

Signs you're about to fabricate:
- You're typing phone numbers from memory instead of from a scraped page
- You're using "555-" prefix numbers (those are fictional)
- You're writing emails that follow a pattern you invented (info@businessname.com) without verifying they exist
- You're showing progress checkmarks (✅) for steps you didn't actually perform

If you catch yourself doing any of these — stop, delete what you wrote, and be honest with the user.

## Understanding B2B vs B2C Lead Generation

This is the most important concept in this skill. The approach is fundamentally different depending on who your owner wants to reach.

### B2B (Business-to-Business) — You CAN scrape these
Businesses publish their contact info publicly because they WANT to be found. Phone numbers, addresses, websites, hours — all freely available on directories. A bakery wanting to sell to restaurants, a marketing agency wanting to reach small businesses, a cleaning company targeting offices — these are B2B. You can build real lists with real contact info.

### B2C (Business-to-Consumer) — You CANNOT scrape individual consumer contact info
Individual people do NOT publish their phone numbers and emails in scrapeable directories. There is no public database of "people who like baked goods in zip code 78228" with their emails and cell numbers. Whitepages has some landlines but requires a name (you can't browse by zip alone), and most data is paywalled.

**When a user asks for a B2C consumer list, be upfront IMMEDIATELY:**
> "I can help you build a customer list, but I want to be straight with you — individual consumer emails and phone numbers aren't available in public directories the way business info is. What I CAN do is [B2C strategies below]. Would you like me to go that route?"

Don't spend 10 messages asking clarifying questions before revealing this limitation. Tell them upfront, then pivot to what you CAN do.

## B2B Scraping: Source Priority

When building a business list, work through these sources in order. If one blocks you, move to the next — try at least 3 before saying you can't find data.

### 1. Yellowpages (BEST — try first)
- URL pattern: `https://www.yellowpages.com/search?search_terms=CATEGORY&geo_location_terms=ZIPCODE`
- No login required, no paywall
- Returns: business name, phone number, address, category, years in business, website
- Typically 30 results per page, multiple pages available
- Categories to search for a bakery's prospects: restaurants, coffee shops, churches, schools, event venues, gyms, offices, catering

**How to scrape:** Navigate to the URL, extract data from `.result` elements. Each listing has `.business-name`, `.phones`, `.street-address`, `.locality`, `.categories`.

### 2. Yelp (GOOD — second choice)
- URL pattern: `https://www.yelp.com/search?find_desc=CATEGORY&find_loc=ZIPCODE`
- No login required
- Returns: business name, rating, review count, neighborhood, hours, price range
- Bonus: reviewer profiles are public — people who review bakeries are people who love food

### 3. Google Maps (GOOD — but loads dynamically)
- URL pattern: `https://www.google.com/maps/search/CATEGORY+near+ZIPCODE`
- No login required
- Returns: business name, address, phone, hours, rating, website
- Caveat: only ~7-10 results load initially; need to scroll to load more
- Results are real-time and very accurate

### 4. Facebook Groups (GOLD for individuals — requires login)
- Can find groups with hundreds of thousands of local members
- Members list shows: real names, workplaces, locations, profile links
- REQUIRES the user to be logged into Facebook — if they're not, this won't work
- Members list loads progressively — scroll to load more
- You get names and profile links but NOT emails or phone numbers directly

**If the user isn't logged into Facebook:** Tell them: "Facebook groups are the best source for individual people, but I need you to be logged into Facebook first. Can you log in and then I'll search for groups in your area?"

### 5. Whitepages (LIMITED)
- Requires a specific name + location — you CANNOT browse by zip code alone
- Searching with no name returns "Page Not Found"
- Good for verifying a specific person, NOT for building a list from scratch
- Most detailed info (phone, address history) is behind a paywall
- 411.com redirects to Whitepages (same company)

## B2C Lead Capture Strategies

When the user wants individual consumers (not businesses), pivot to helping them BUILD a capture system. These are proven strategies that actually work:

### 1. Lead Magnet + Landing Page (highest ROI)
Help the user create an offer that gets people to voluntarily give their contact info:
- "Free [product] — enter your email to claim"
- "10% off your first order — sign up here"
- "[Free guide/recipe/resource] — download now"

You can help write the copy, design the page concept, and draft the email sequence.

### 2. Facebook/Instagram Ads
Target the exact demographics in the user's area:
- Geographic targeting by zip code
- Interest targeting (food, baking, restaurants, etc.)
- Lookalike audiences from existing customers
- Budget: $50-100 can reach thousands of local people

You can help write ad copy and suggest targeting parameters.

### 3. Facebook Group Engagement
Instead of scraping members, ENGAGE in those groups:
- Post valuable content (not spam)
- Share special offers
- Build relationships that convert to customers
- Groups with 300K+ food lovers in a city = massive opportunity

### 4. Google My Business
- Set up the business listing (free)
- Collect reviews (each reviewer is a warm lead)
- Post updates and offers
- Appear in local search results

### 5. Contests and Giveaways
- "Win a free [product] — enter your name, email, and phone"
- Share in local Facebook groups
- People voluntarily give you their contact info

### 6. SMS Opt-In
- "Text [KEYWORD] to [NUMBER] for 10% off"
- Every in-store customer becomes a lead

## Output Format

When you successfully scrape a list, present it in a clean, organized format:

### For Business Lists:
Create a table or structured output with:
| Business Name | Phone | Address | Category | Source |
The source column is important — it proves the data is real and tells the user where it came from.

### For Facebook Group Findings:
Show the groups you found with member counts, and list individual members you extracted with whatever info was visible (name, workplace, location).

### Always Include:
- Total count of prospects found
- Which sources you used
- What you searched for
- What you COULDN'T find and why
- Suggested next steps

## Common Scenarios

### "Build me a list of 100 people with emails and phone numbers"
Be honest: "I can build you a list of local businesses with real phone numbers right now — restaurants, cafes, offices, churches in your area that might want to buy from you. For individual consumer emails and phone numbers, those aren't in public directories. But I can help you set up a lead magnet that'll collect that info from people who are actually interested. Want me to start with the business list while we get the consumer capture set up?"

### "Scrape from whitepages"
Be honest: "Whitepages requires a specific name to search — I can't browse by zip code alone. For building a list from scratch, Yellowpages and Yelp are much better. Want me to start there?"

### "Just get me the data, I don't care how"
Never cut corners. "I want to make sure everything I give you is real and usable. Let me scrape [source] and get you verified contacts. I'd rather give you 30 real prospects you can call today than 100 fake ones that waste your time."

### User gets frustrated that you can't scrape consumer emails
Acknowledge their frustration, then redirect: "I totally get it — it would be amazing if I could just pull 100 emails out of a directory. The reality is that consumer contact info is protected, and anyone claiming they can scrape it is either breaking the law or making it up. But here's the good news: the strategies I'm suggesting (lead magnets, social media, local groups) actually convert better because the people CHOSE to give you their info. They're already interested."
