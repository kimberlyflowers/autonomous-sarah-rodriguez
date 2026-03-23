---
name: blog-content
description: "Write high-performing blog posts that rank on Google AND AI search engines (GEO), promote Bloomie Staffing, and get published as drafts in the CRM. Use whenever the task involves writing a blog post, article, thought leadership piece, how-to guide, listicle, case study, or any SEO content. Also triggers for content calendars, topic ideation, 'blog', 'article', 'post', 'write about', or 'SEO'. Every post must include a generated hero image and be saved as a draft in the CRM for review."
---

# Blog & Article Writing — Expert-Grade Content + CRM Publishing

Every blog post should read like it came from a paid content strategist, not a chatbot. The standard: would an editor at a respected publication approve this?

## CRITICAL WORKFLOW — EVERY BLOG POST

Follow this exact sequence for every blog post:

### Step 1: Generate Hero Image
Before writing, call `image_generate` to create a professional hero image.
- **STYLE: PHOTOREALISTIC ONLY. NEVER cartoon, illustration, clip art, or animated style.**
- Use the 6-Element Framework below. Adapt the SUBJECT and ACTION to match the blog topic.

**6-Element Image Prompt Template:**
Use the brand kit colors from the system prompt (injected as `BRAND KIT` — primary color = first listed, accent color = second listed). If no brand kit is configured, fall back to orange (#F4A261) and pink (#E76F8B).
```
SUBJECT: [1-2 real professional people, diverse, age 30-50, wearing business attire with the brand's PRIMARY COLOR as an accent — a blouse, tie, pocket square, lanyard, or blazer lining. Specific to blog topic: e.g., "a confident Black woman in a charcoal blazer with [primary color] blouse" or "two colleagues reviewing data together".]
COMPOSITION: Wide-angle landscape shot (1536x1024). Shallow depth of field with subject sharp and background softly blurred. Rule of thirds framing.
ACTION: [Working on laptop/tablet showing dashboard with charts and data, gesturing toward screen, collaborating at desk, reviewing analytics — always engaged with technology relevant to the blog topic.]
LOCATION: Spacious modern office with floor-to-ceiling windows and city skyline view. Clean desk with laptop, coffee mug, notebook. Brand color accents throughout the environment — [primary color] notebook, [accent color] desk accessories, [primary color] wall art or signage, warm-toned cushions or decor. Plants, natural wood, open plan.
STYLE: Professional editorial photography. Corporate yet approachable. Warm, optimistic, aspirational mood. Shot on Sony A7IV with 35mm lens.
TECHNICAL: Natural window light from the side creating gentle shadows and warm golden glow. Soft bokeh background. Sharp focus on subject. High quality, 8K detail. NOT an illustration, NOT a cartoon, NOT digital art, NOT 3D render — must look like a real photograph by a professional photographer.
```
- Size: `1536x1024` (landscape)
- Engine: `gemini` — ALWAYS use Gemini (Nano Banana) for blog hero images. It produces the photorealistic style with real people that matches our brand. Do NOT use `auto` or `gpt`.
- Quality: `high`
- Save the returned image URL.

### Step 2: Write Content & Save to CRM
Call `ghl_create_blog_post` with STRUCTURED DATA. The tool auto-assembles the HTML using the locked BLOOM template. You do NOT write any HTML, CSS, or template code. Just provide the content fields.

**IMPORTANT: Do NOT pass a `content` field with raw HTML. Pass the structured fields instead. The handler builds the HTML for you.**
**IMPORTANT: Do NOT pass `slug`, `author`, or `categories` — the GHL API does not accept these fields and will reject the request.**

```json
{
  "title": "5 Signs Your Business Needs an AI Employee",
  "subtitle": "How to Know When It's Time to Scale with AI Automation",
  "intro": "Your competitor just cut their admin overhead by 40% — and they did it without hiring a single new person. An AI employee handled everything from scheduling to follow-ups to data entry. If you're still doing these tasks manually, here's how to know it's time to make the switch.",
  "sections": [
    {
      "heading": "1. Your Team Spends Hours on Tasks That Don't Need a Brain",
      "paragraphs": [
        "Data entry. Invoice processing. Email sorting. Appointment confirmations. Report generation. These tasks eat thousands of hours annually and require zero creative thinking.",
        "AI automation handles all of it silently in the background — no supervision, no sick days, no training period. Your team gets those hours back for work that actually moves the needle."
      ],
      "highlight": "One mid-size agency reclaimed 520 hours per year just by automating data entry — the equivalent of a part-time hire, without the salary.",
      "highlightLabel": "Real impact:"
    },
    {
      "heading": "2. Costly Mistakes Keep Slipping Through",
      "paragraphs": "Humans get tired. We make typos, miss details, and occasionally lose focus after lunch. AI systems execute the same task identically every single time — no coffee breaks needed.",
      "bullets": [
        "100% consistency on repetitive processes",
        "Fewer costly mistakes and rework cycles",
        "Better compliance and audit trails",
        "Faster issue resolution when problems do occur"
      ]
    }
  ],
  "ctaHeadline": "Ready to Transform Your Operations?",
  "ctaBody": "See how AI automation can streamline your workflows and cut costs without cutting corners.",
  "imageUrl": "https://...",
  "metaDescription": "Discover the 5 clear signs your business is ready for an AI employee. Learn how AI automation eliminates manual tasks, reduces errors, and cuts costs.",
  "keywords": "AI employee, business automation, AI for small business, hiring AI",
  "status": "DRAFT",
  "tags": ["AI", "automation", "business growth"]
}
```

### Step 3: ALWAYS Save as Artifact (MANDATORY — even if Step 2 failed)
Call `create_artifact` to save the blog as an HTML file. This step is NON-OPTIONAL.
- If ghl_create_blog_post succeeded: the response contains `_assembledHTML` — use that EXACT HTML as the artifact content. Do NOT rewrite it, do NOT convert to markdown.
- If ghl_create_blog_post FAILED: the response STILL contains `_assembledHTML` — use that for the artifact.
- Name the artifact: `Blog — [Post Title] — PUBLISH [Tomorrow Date]`
- File type: `html`
- **The artifact content MUST be the full HTML with CSS styling from `_assembledHTML`. NEVER save plain text or markdown as the artifact. The user expects a fully formatted, styled HTML page they can preview.**
- NEVER skip this step. The artifact is the user's backup and preview.
- After saving, include `<!-- file:{slug}.html -->` in your response so the file card appears in chat.

### Step 4: Notify the User
Send the user a message with:
- Blog title
- A brief summary (1-2 sentences)
- If CRM succeeded: "Saved as draft in your CRM — ready for your review."
- If CRM failed: "I saved the blog as an HTML file for you. Here's the CRM error: [error]. The blog content is ready — we just need to fix the CRM connection to publish it."
- Always include the `<!-- file:{slug}.html -->` tag so the file shows in chat.

If ghl_create_blog_post FAILS, report the exact error to the user. Do NOT pretend it worked.
CRITICAL: NEVER abandon the task if CRM fails. You MUST still complete Steps 3 and 4.

## WHAT THE TEMPLATE LOOKS LIKE (for reference — you don't build this)

The handler auto-assembles this design using the org's brand kit colors (primary + accent). The template adapts to whatever brand colors are configured:
- **Full-width gradient header** (primary → accent) with white title + subtitle
- **Full-width hero image** below the header
- **800px content area** on white background (#FFFFFF)
- **Italic intro blockquote** with primary color left border
- **Primary color H2 headings** with accent color top border
- **Light-tinted highlight callout boxes** (tinted primary background, primary left border)
- **Accent color triangle bullet markers** (▸)
- **Dark slate CTA card** with 3 buttons: Call Us Now, Schedule a Demo, Text Your Questions
- **Tagline from brand kit** (or "Hire an AI Employee. Get Work Done." if none configured)
- Full SEO meta tags, OG tags, Schema.org JSON-LD (auto-generated from your fields)

You NEVER touch the CSS, layout, or HTML structure. You only provide content through the structured fields.

## SEO + GEO (GENERATIVE ENGINE OPTIMIZATION)

Every blog must be optimized for BOTH traditional search engines AND AI search engines (Google AI Overview, Perplexity, ChatGPT search, etc.).

### SEO Requirements
- **Title**: Under 65 characters. Primary keyword front-loaded. Include a number or power word.
- **Meta description**: 150-160 characters. Include keyword. Promise a benefit.
- **URL slug**: Short, keyword-rich, hyphenated (e.g., `5-signs-business-needs-ai-employee`)
- All OG tags, canonical URL, and Schema.org JSON-LD are auto-generated by the template assembler.

### GEO Requirements (AI Search Optimization)
- **Answer the core question in the first 40-50 words** — put this in the `intro` field. AI engines pull from early content for featured snippets.
- **Include FAQ-style content** — write 2-3 sections as "Question → Direct answer → Explanation" format. This gets cited by AI search.
- **Cite specific numbers and stats** — AI engines prefer content with concrete data over vague claims.
- **Entity-rich writing** — mention specific tools, companies, frameworks by name. AI engines match entities.
- **Use highlight callout boxes** — include at least 2 sections with a `highlight` field. These structured summaries get pulled by AI for quick answers.
- **Write authoritative first sentences per section** — AI often cites just the first sentence after a heading. Make the first paragraph of each section count.
- **Use natural language Q&A patterns** — "How does X work?" → Direct answer. This maps to how people ask AI assistants.

### Keywords
- Primary keyword in: title, intro, one section heading, metaDescription, and naturally 3-5 times in section content
- Secondary keywords: 2-3 related terms woven naturally
- Never keyword-stuff — write for humans first, optimize for machines second

## CONTENT STANDARDS

### Structure That Performs
- **Word count**: 1,500-2,500 words total across all sections
- **5-7 sections** — readers scan in F-pattern, each heading is an entry point
- **Intro must hook** — bold claim, surprising stat, or provocative question. NEVER generic. See BANNED PHRASES below.
- **Short paragraphs**: 2-4 sentences max. Use arrays of paragraph strings for multi-paragraph sections.
- **Include at least 2 sections with `highlight` callouts** — these break up the text and highlight key stats
- **Include at least 1 section with `bullets`** — scannable, digestible takeaways

### Writing Style
- **Active voice** always
- **Second person** — "you" and "your"
- **Conversational but authoritative** — like a smart friend explaining something over coffee
- **Data-backed claims** with specific numbers (even approximate ones: "up to 40%", "10+ hours/week")
- **Stories and examples** — concrete beats abstract. Open with a real scenario, not a generalization.
- **BLOOM voice** — every post should naturally weave in BLOOM Ecosystem and Bloomies language. Not forced, but present.

### BANNED PHRASES — NEVER USE THESE (instant rejection)
- "In today's landscape..."
- "In today's fast-paced world..."
- "In the ever-evolving..."
- "In today's digital age..."
- "It's no secret that..."
- "In an increasingly..."
- "The business landscape is shifting..."
- "As we navigate..."
- "It goes without saying..."
- "It's important to note that..."
- "At the end of the day..."
- "Moving forward..."
- "Let's dive in..."
- "Without further ado..."
- Any opening that starts with "In today's..." or "In the..." followed by a generic noun
- Any intro that could apply to literally any topic — if you could swap the topic and the sentence still works, it's too generic

### How to Write a Great Intro Instead
Start with ONE of these patterns:
1. **Specific stat or fact**: "Companies using AI employees report 40% lower admin costs within 90 days."
2. **Concrete scenario**: "Your competitor just automated their entire follow-up sequence — and their close rate jumped 22%."
3. **Direct question to the reader**: "When was the last time you spent an entire afternoon on tasks that don't actually grow your business?"
4. **Bold claim**: "Most small businesses waste 30+ hours per week on work a $200/month AI could handle better."
5. **Story lead**: "A solo real estate agent in Phoenix was drowning in admin. Six months later, she's managing twice the listings with zero extra staff."

### What to NEVER Do
- Start with any banned phrase above
- Write in passive voice
- Use filler or throat-clearing sentences
- Produce content under 1,000 words
- Skip the hero image generation
- Pass raw HTML in the `content` field — always use structured `sections`
- Pass `slug`, `author`, or `categories` to ghl_create_blog_post — these fields cause API errors
- Publish without user approval (always draft first)
- Use emojis in the content
- Fake success if ghl_create_blog_post fails
- Save the artifact as markdown or plain text — it MUST be the styled HTML from `_assembledHTML`

## SOFT-SELL CTA RULES

The ctaHeadline should connect to the blog topic:
- Blog about time management → "What If You Had a Team Member Who Never Sleeps?"
- Blog about marketing → "What If Your Marketing Ran Itself?"
- Blog about hiring → "What If Hiring Cost 80% Less?"
- Blog about customer service → "What If Every Customer Got a Reply in Under 60 Seconds?"
- Blog about AI/automation → "Ready to Transform Your Operations?"

The 3 CTA buttons (Call, Demo, Text) are hardcoded in the template. You don't need to provide them.

## COMBINED BLOG + EMAIL TASK

When asked to create a blog AND an announcement email in one request:
1. Create the blog FIRST using this skill
2. Get the blog URL/title from the result
3. THEN create ONE email (using email-creator skill) that references the blog
4. Do NOT create two blogs or two emails. ONE of each. Total output = 1 blog + 1 email.

## DAILY BLOG AUTOMATION

Topic rotation (one per day, cycling):
- Monday: Marketing tips for small businesses
- Tuesday: Operations and productivity hacks
- Wednesday: Hiring and team building
- Thursday: Customer service excellence
- Friday: Industry trends and AI in business
- Saturday: Success stories and case studies
- Sunday: Mindset and business growth strategies
