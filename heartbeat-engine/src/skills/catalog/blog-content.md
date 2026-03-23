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
- Prompt pattern: "Professional editorial photograph for blog article about [topic]. Clean, modern, business-appropriate. No text overlays. High quality, warm natural lighting. Wide landscape format."
- Save the returned image URL.

### Step 2: Write Content & Save to CRM
Call `ghl_create_blog_post` with STRUCTURED DATA. The tool auto-assembles the HTML using the locked BLOOM template. You do NOT write any HTML, CSS, or template code. Just provide the content fields.

**IMPORTANT: Do NOT pass a `content` field with raw HTML. Pass the structured fields instead. The handler builds the HTML for you.**

```json
{
  "title": "5 Signs Your Business Needs an AI Employee",
  "subtitle": "How to Know When It's Time to Scale with AI Automation",
  "intro": "The business landscape is shifting. Companies that embrace AI and automation are moving faster, working smarter, and keeping more profit. If you're still managing repetitive tasks manually, you're leaving money on the table — and giving your competition an unfair advantage.",
  "sections": [
    {
      "heading": "1. Eliminate Repetitive Manual Tasks",
      "paragraphs": [
        "Every business has them: data entry, invoice processing, email sorting, appointment scheduling, report generation. These tasks consume thousands of hours per year and require constant human attention.",
        "AI automation handles all of it. Once configured, it works silently in the background — no supervision needed. Your team reclaims those hours for meaningful work."
      ],
      "highlight": "A team member spending 10 hours per week on manual data entry just freed up 520 hours annually. That's equivalent to hiring someone part-time without the salary.",
      "highlightLabel": "The impact:"
    },
    {
      "heading": "2. Reduce Human Error and Quality Issues",
      "paragraphs": "Humans get tired. We make typos, miss details, and occasionally lose focus. AI systems execute the same task identically every single time.",
      "bullets": [
        "100% consistency on repetitive processes",
        "Fewer costly mistakes and rework",
        "Better compliance and audit trails",
        "Faster issue resolution when problems do occur"
      ]
    }
  ],
  "ctaHeadline": "Ready to Transform Your Operations?",
  "ctaBody": "See how AI automation can streamline your workflows and cut costs without cutting corners.",
  "imageUrl": "https://...",
  "slug": "5-signs-business-needs-ai-employee",
  "metaDescription": "Discover the 5 clear signs your business is ready for an AI employee. Learn how AI automation eliminates manual tasks, reduces errors, and cuts costs.",
  "keywords": "AI employee, business automation, AI for small business, hiring AI",
  "status": "draft",
  "tags": ["AI", "automation", "business growth"]
}
```

### Step 3: ALWAYS Save as Artifact (MANDATORY — even if Step 2 failed)
Call `create_artifact` to save the blog as an HTML file. This step is NON-OPTIONAL.
- If ghl_create_blog_post succeeded: the response contains `_assembledHTML` — use that as the artifact content.
- If ghl_create_blog_post FAILED: the response STILL contains `_assembledHTML` — use that for the artifact.
- Name the artifact: `{slug}.html` (e.g., `5-signs-business-needs-ai-employee.html`)
- File type: `html`
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

The handler auto-assembles this design:
- **Full-width gradient header** (orange #F4A261 → pink #E76F8B) with white title + subtitle
- **Full-width hero image** below the header
- **800px content area** on white background (#FFFFFF)
- **Italic intro blockquote** with orange left border
- **Orange H2 headings** (#F4A261) with pink top border (#E76F8B)
- **Peach highlight callout boxes** (#FFF3E0 background, orange left border)
- **Orange triangle bullet markers** (▸)
- **Dark slate CTA card** with 3 buttons: Call Us Now, Schedule a Demo, Text Your Questions
- **"Hire an AI Employee. Get Work Done."** tagline
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
- **Intro must hook** — bold claim, surprising stat, or provocative question. Never "In today's world..."
- **Short paragraphs**: 2-4 sentences max. Use arrays of paragraph strings for multi-paragraph sections.
- **Include at least 2 sections with `highlight` callouts** — these break up the text and highlight key stats
- **Include at least 1 section with `bullets`** — scannable, digestible takeaways

### Writing Style
- **Active voice** always
- **Second person** — "you" and "your"
- **Conversational but authoritative** — like a smart friend explaining something
- **Data-backed claims** with specific numbers (even approximate ones: "up to 40%", "10+ hours/week")
- **Stories and examples** — concrete beats abstract

### What to NEVER Do
- Start with "In today's fast-paced world..." or any cliche
- Write in passive voice
- Use filler: "It's important to note that", "It goes without saying"
- Produce content under 1,000 words
- Skip the hero image generation
- Pass raw HTML in the `content` field — always use structured `sections`
- Publish without user approval (always draft first)
- Use emojis in the content
- Fake success if ghl_create_blog_post fails

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
