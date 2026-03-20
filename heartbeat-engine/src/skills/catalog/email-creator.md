---
name: email-creator
description: "Create professional marketing emails, newsletters, blog announcement emails, and campaign emails. Use whenever the task involves creating an email, newsletter, campaign email, blog promotion email, drip sequence email, or any email content to be sent to a list. Also triggers for 'email', 'newsletter', 'campaign', 'send to list', 'email blast', 'announce blog', 'promote blog', or 'email marketing'. Every email is saved as a DRAFT in the CRM for user review before sending."
---

# Email Creator — Draft-First CRM Email Pipeline

Every email should feel like it came from a real person who gives a damn — not a mass-blast template. The standard: would you open this email AND read to the end?

## CRITICAL WORKFLOW — EVERY EMAIL

Follow this exact sequence for every email:

### Step 1: Generate Hero Image
Before writing, call `image_generate` to create a professional hero image.
- Prompt pattern: "Professional editorial photograph for email about [topic]. Clean, modern, business-appropriate. No text overlays. High quality, warm natural lighting. 600x300 aspect ratio."
- Save the returned image URL.

### Step 2: Write Content & Save to CRM
Call `ghl_create_email_template` with STRUCTURED DATA. The tool auto-assembles the HTML using the locked BLOOM email template. You do NOT write any HTML, CSS, or template code. Just provide the content fields.

**IMPORTANT: Do NOT pass an `html` field with raw HTML. Pass the structured fields instead. The handler builds the HTML for you.**

```json
{
  "name": "Blog Announcement - 5 Signs AI Employee - Mar 2026",
  "subject": "5 signs your business is ready for AI",
  "previewText": "Number 3 surprises most business owners.",
  "headline": "5 Signs Your Business Needs an AI Employee",
  "openingHook": "I wanted to share something that keeps coming up in conversations with business owners this month. If any of these sound familiar, it might be time to rethink how you're scaling.",
  "calloutHeading": "Inside the post:",
  "calloutItems": [
    "Why repetitive tasks are costing you more than you think",
    "The hidden cost of human error on routine processes",
    "How businesses are scaling without growing headcount"
  ],
  "extraParagraph": "Whether you're a solopreneur wearing every hat or managing a growing team, these patterns show up everywhere.",
  "ctaButtonText": "Read the Full Post",
  "ctaButtonUrl": "https://yourblog.com/5-signs-business-needs-ai-employee",
  "ctaHeadline": "What If Your Business Ran Itself?",
  "ctaBody": "Bloomie AI employees handle your marketing, content, customer service, and operations — so you can focus on what matters.",
  "imageUrl": "https://...",
  "type": "blog-announcement",
  "tags": ["blog", "AI", "automation"]
}
```

### Step 3: Also Save as Artifact
Call `create_artifact` to save the email HTML as a file in the Files tab (backup + preview).

### Step 4: Notify the User
Send the user a message with:
- Email subject line
- A brief summary (1-2 sentences)
- The CRM email draft link for review (or artifact link if CRM failed)
- "Ready for your review — once you approve, I'll send it to your list."

If ghl_create_email_template FAILS, report the exact error to the user. Do NOT pretend it worked.

## WHAT THE TEMPLATE LOOKS LIKE (for reference — you don't build this)

The handler auto-assembles this design:
- **600px centered email wrapper** on light gray background
- **Hero image** with 8px border-radius inside header
- **Bold h1 headline** — the actual blog title or email topic (NEVER "New Blog Post")
- **Opening hook paragraph** — conversational, 1-2 sentences
- **Orange-bordered callout box** (#FFF3E0 background, #F4A261 left border) with orange triangle markers
- **Centered gradient CTA button** (orange → pink) — "Read the Full Post" or custom text
- **Gradient divider** (orange → pink, 3px) separating content from Bloomie CTA
- **Dark slate Bloomie CTA card** with 3 buttons: Call Us Now, Schedule a Demo, Text Your Questions
- **"Hire an AI Employee. Get Work Done."** tagline
- **Simple footer** with unsubscribe/preferences links

You NEVER touch the CSS, layout, or HTML structure. You only provide content through the structured fields.

## SUBJECT LINE RULES

- **6-10 words** = highest open rate
- **Front-load value** — mobile truncates after ~35 chars
- **Curiosity > Clickbait** — create information gaps, don't deceive
- **Power formulas**:
  - Question: "Still struggling with [pain point]?"
  - Number: "3 things your team needs this week"
  - Urgency: "Last chance: [offer] ends tonight"
  - Personal: "[Name], quick question about [topic]"
  - Story: "I almost gave up on [thing]... then this happened"
- **NEVER**: ALL CAPS, excessive punctuation, "FREE" as first word, misleading subjects

## PREVIEW TEXT RULES

- First 90 characters after subject drive 24% of open decisions
- Don't waste on "View in browser" — that's the default if unset
- Complement the subject — expand curiosity, don't repeat

## CALLOUT BOX HEADINGS BY EMAIL TYPE

- **Blog Announcement**: "Inside the post:" → 3 key takeaways from the blog
- **Newsletter**: "This week:" → 3-5 topics covered
- **Promotional**: "What you get:" → 3 benefits/features
- **Welcome**: "Here's what to expect:" → 3 things they'll receive
- **Re-engagement**: "What you've missed:" → 3 recent highlights

## SOFT-SELL CTA RULES

Every email gets the Bloomie CTA card (auto-generated). You control the headline and body:

Connect the ctaHeadline to the email topic:
- If about time management → "What If You Had a Team Member Who Never Sleeps?"
- If about marketing → "What If Your Marketing Ran Itself?"
- If about hiring → "What If Hiring Cost 80% Less?"
- If about customer service → "What If Every Customer Got a Reply in Under 60 Seconds?"
- If about AI/automation → "Ready to Transform Your Operations?"

The 3 CTA buttons (Call, Demo, Text) are hardcoded. You don't need to provide them.

## EMAIL TYPES

### Blog Announcement Email (most common)
- `headline`: The ACTUAL blog post title (never "New Blog Post")
- `openingHook`: 1-2 sentence hook about the blog topic
- `calloutHeading`: "Inside the post:"
- `calloutItems`: 3 key takeaways from the blog
- `ctaButtonText`: "Read the Full Post"
- `ctaButtonUrl`: The blog URL
- **Word count**: 100-200 words (quick read, drive to blog)

### Newsletter
- `headline`: Themed title (e.g., "Your Weekly Business Intel")
- `calloutHeading`: "This week:"
- `calloutItems`: 3-5 topic summaries
- `ctaButtonText`: "Read More"
- **Word count**: 200-350 words

### Promotional/Sales
- `headline`: Benefit-driven (NOT product name)
- `calloutHeading`: "What you get:"
- `calloutItems`: Key benefits
- `ctaButtonText`: "Get Started" / "Claim Your Offer"
- **Word count**: 150-250 words

### Welcome Email
- `headline`: Warm welcome (e.g., "Welcome to the Team!")
- `calloutHeading`: "Here's what to expect:"
- `calloutItems`: 3 things they'll receive
- `ctaButtonText`: "Explore"
- **Word count**: 150-200 words

## COPY STYLE

- **Conversational first person** — "I wanted to share..." not "We are pleased to announce..."
- **Write like you talk** — read it aloud. If it sounds stiff, rewrite.
- **Benefits over features** — "Save 3 hours every week" not "Automated scheduling tool"
- **Specific numbers** — "47 businesses enrolled last month" not "many businesses"
- **Short text** — the openingHook and extraParagraph should be concise (1-3 sentences each)

## COMBINED BLOG + EMAIL TASK

When asked to create a blog AND an announcement email in one request:
1. Create the blog FIRST using blog-content skill
2. Get the blog URL/title from the result
3. THEN create ONE email using this skill — headline = exact blog title
4. Do NOT create two blogs or two emails. ONE of each.

## WHAT TO NEVER DO

- Use "New Blog Post" or generic text as the headline — use the ACTUAL title
- Pass raw HTML in the `html` field — always use structured fields (calloutItems, etc.)
- Send without user approval (always draft first)
- Write promotional emails longer than 300 words
- Use deceptive subject lines
- Skip the hero image generation
- Use emojis in the email content
- Fake success if ghl_create_email_template fails
