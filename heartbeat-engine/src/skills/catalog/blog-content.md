---
name: blog-content
description: "Write high-performing blog posts that rank on Google AND AI search engines (GEO), then publish them directly to Bloomie's live /p blog system. Use whenever the task involves writing a blog post, article, thought leadership piece, how-to guide, listicle, case study, or any SEO content. Also triggers for content calendars, topic ideation, 'blog', 'article', 'post', 'write about', or 'SEO'. Every post must include a generated hero image, be saved as an HTML artifact, published to /p, and verified live."
---

# Blog & Article Writing — Expert-Grade Content + Direct /p Publishing

Every blog post should read like it came from a paid content strategist, not a chatbot. The standard: would an editor at a respected publication approve this?

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE writing any content or generating images. This is a hard rule with zero exceptions.**

### OPTIONAL PLATFORM STRATEGY: Question-Led Content

Some organizations enable **Question-Led Content Strategy** in Settings. When that setting is ON, an extra mandatory gate is injected into your prompt: every blog must answer a real question the ideal audience has already asked online or in customer conversations, then expand to the next likely question. When the setting is OFF, continue using the standard discovery flow below.

### The 5 things you MUST know before writing:
1. **Topic** — What is the blog post about? What specific angle or question does it answer?
2. **Audience** — Who is this written for? (their customers, industry peers, general public)
3. **Goal** — What should the blog do for the business? (drive traffic, establish authority, educate, generate leads)
4. **Tone & style** — How should it read? (professional/formal, conversational/friendly, bold/opinionated, educational)
5. **Key points** — Any specific facts, stats, stories, or talking points that must be included?

### Discovery Flow — call bloom_clarify for each missing piece (one at a time):

**Question 1 — Topic & angle:**
Options: "I have a specific topic in mind (I'll describe)", "Suggest topics based on my industry", "I want to write about a recent trend or news", "Help me pick from a content calendar"
Context: "What should this blog post be about? A specific angle helps me write something focused and valuable."

**Question 2 — Who is this for?**
Options: "My customers / potential clients", "Industry peers / professionals", "General audience / public", "Internal team / employees"
Context: "Who will read this? This changes the language, depth, and examples I use."

**Question 3 — What should this blog do for your business?**
Options: "Drive search traffic (SEO focus)", "Establish thought leadership", "Educate & inform readers", "Generate leads (with CTA)", "Support a product or service launch"

**Question 4 — Tone & voice:**
Options: "Professional & authoritative", "Conversational & approachable", "Bold & opinionated", "Educational & detailed"

**Question 5 — Key details (FREE TEXT — do not use buttons):**
Ask: "Any specific points, stats, stories, or examples you want included? Also, how long should this be — quick read (~600 words), standard (~1,200 words), or deep-dive (~2,000+ words)?"

### SKIP LOGIC:
- If the user already gave a specific topic → skip Question 1
- If audience is obvious from context → skip Question 2
- If tone matches their brand voice on file → skip Question 4
- NEVER ask more than one bloom_clarify at a time

### HARD STOP: Do NOT write content or generate images until at least Questions 1, 2, and 3 are answered.

---

## CRITICAL WORKFLOW — EVERY BLOG POST

Follow this exact sequence for every blog post:

### Source-of-Truth Format References
When the owner gives a live post as the source of truth, use it as a **format reference only** unless they explicitly say to reuse the copy. Match the visible structure, spacing, media order, author/date treatment, section rhythm, CTA placement, and CSS classes. Do not copy the topic, wording, examples, claims, or source-post argument into the new article.

### Step 1: Generate Hero Image
Before writing, call `image_generate` to create a professional hero image.
- **STYLE: PHOTOREALISTIC ONLY. NEVER cartoon, illustration, clip art, or animated style.**
- The image must feel like an editorial thumbnail someone would click, not a polished stock photo.
- Use the Click-Worthy Hero Framework below. Adapt the SUBJECT, MOMENT, and TENSION to match the blog topic.

**Click-Worthy Hero Framework:**
Use the brand kit colors from the system prompt (injected as `BRAND KIT` — primary color = first listed, accent color = second listed). If no brand kit is configured, fall back to orange (#F4A261) and pink (#E76F8B).
```
SUBJECT: [1-2 specific real people from the audience world, diverse, age 30-55, with one brand-color accent in clothing or workspace. Name the role visually, e.g. "solo RIA principal", "operations manager", "overloaded advisor assistant", not generic "business professional".]
MOMENT: [A concrete moment with stakes from the article: the missed follow-up, the messy onboarding packet, the lead spreadsheet nobody trusts, the client review pile, the advisor staring at a silent phone after a seminar. The viewer should understand the problem in one glance.]
TENSION: [Add one visual contradiction or curiosity gap: polished advisor office vs chaotic sticky notes, expensive lead list with red flags circled, empty second-meeting chair, client file stack next to a glowing automated checklist, calendar full of follow-ups with one overdue item highlighted.]
COMPOSITION: Wide 16:9 landscape editorial shot (1536x1024). Human face or hands visible. Strong foreground object tied to the problem. Rule of thirds. Leave clean negative space for possible crop, but do not put text in the image.
LOCATION: Specific real-world setting from the article, not a generic glass office. Examples: small RIA conference room, home-office advisory desk, seminar follow-up table, onboarding paperwork station, client-review prep desk, CRM cleanup war room.
STYLE: Photorealistic editorial magazine photography with documentary tension. Premium but not sterile. Looks like a captured real business moment, not a stock photo.
TECHNICAL: Natural light, realistic shadows, sharp subject, believable workspace details, 8K detail. No fake UI text, no readable brand names, no hands with errors, no plastic smiles, no cartoon/illustration/3D render.
```
- The prompt must include a one-sentence **click reason** internally before generation: "Someone would click this because..." Then convert that reason into visual details in the image prompt.
- Avoid generic laptop-and-dashboard scenes unless the article is specifically about dashboard reporting. A laptop alone is not a story.
- For financial-advisor topics, show the advisor's real operational pain: lead quality doubts, follow-up gaps, onboarding friction, CRM mess, review prep, fee/trust tension, or first-meeting uncertainty.
- Size: `1536x1024` (landscape)
- Engine: `auto` — The system automatically selects the best engine based on the admin's dashboard configuration (Settings > Image Engine). Default for blogs is Gemini (Nano Banana) for photorealistic people shots. The admin can change this at any time.
- Quality: `high`
- Save the returned image URL.

### Step 2: Write Complete HTML Using the Bloomie Master Template
Build the full blog post as a complete HTML document. Do NOT use GHL for Bloomie blog publishing.

Required page rules:
- Include `<!-- Bloomie Blog Master v2026-06-19 -->` in the HTML.
- Do not recreate the top site navigation inside the article. The app injects the master `nav.site-nav` at publish/serve time. If you include navigation markup anyway, it must be the standard Bloomie nav only; never write custom nav CSS or `all: unset` resets.
- Use `header.blog-master-header` followed by one direct `img.hero-image`, then `div.content`.
- The hero image must use the public URL from Step 1 and display as 16:9 landscape. CSS must include `max-width: 980px` and `aspect-ratio: 16 / 9`.
- Match the locked hero overlap treatment: the hero image should pull upward into the colored header area with a negative top margin, rounded corners, a soft shadow, a subtle light border, `position: relative`, and `z-index: 2`. The reference pattern is `margin: -28px auto 0; border-radius: 18px; box-shadow: 0 22px 55px rgba(45,52,54,.24); border: 1px solid rgba(255,255,255,.7);`.
- If the reference post includes a podcast companion, match the visual format. When you have a real public `bloom-audio` URL, use a real audio control. While audio tooling is being tested, you may use a clearly styled pending/placeholder podcast companion so the layout can be reviewed, but do not publish an empty or broken browser audio player.
- Inside `div.content`, the first visible block must be the standard author row:
  - `<div class="author-row">`
  - author avatar image from the public `bloom-images` Supabase bucket
  - `<div class="author-name">Sarah Rodriguez</div>` or `<div class="author-name">Marcus Chen</div>`
  - role line plus visible publication date, e.g. `Bloomie Staffing contributor focused on AI employee workflows for e-commerce teams · July 2, 2026`
- Add a small visible article navigation link to `/p/blog` near the top of `div.content` before or directly after the author row, using text such as `Back to Blog`. This is separate from the master top nav and must appear on every post.
- Do not put the final CTA before the practical article body. The dark `cta-card` belongs near the end of the article, before the footer, after the useful sections and any natural FAQ/Q&A material.
- The final CTA must use the locked `.cta-card` class, include a topic-specific headline and useful body copy, and contain the exact three buttons below.
- Public copy must say `Bloomie Staffing`, not `BLOOM Ecosystem`.
- Include the standard Bloomie CTA labels and a professional blog layout, not markdown.

### Step 3: Save as Artifact
Call `create_artifact` to save the blog as an HTML file.
- Name: `Blog - [Post Title].html`
- File type: `html`
- MIME type: `text/html`
- Content: the complete HTML document from Step 2.
- NEVER save markdown or plain text for a blog post.

### Step 4: Publish to /p and Verify Live
Call `publish_artifact` using the artifact ID returned by `create_artifact`.
- Use a clean, keyword-rich slug beginning with `blog-`.
- The returned URL must be `https://bloomiestaffing.com/p/[slug]`.
- Verify the live URL with `web_fetch`.
- The task is not complete until the live URL loads and contains the title, master marker, public hero image, and Bloomie Staffing copy.

### Step 5: Report Completion
Report:
- Blog title
- Live URL
- Artifact ID
- Verification result

If `create_artifact`, `publish_artifact`, or `web_fetch` fails, report the exact error. Do NOT pretend it was published.
CRITICAL: A Bloomie blog task is not complete until the /p URL is live and verified.

## WHAT THE TEMPLATE LOOKS LIKE (for reference — you don't build this)

The handler auto-assembles this design using the org's brand kit colors (primary + accent). The template adapts to whatever brand colors are configured:
- **Full-width gradient header** (primary → accent) with white title + subtitle
- **16:9 hero image** below the header, constrained to the master template width
- **800px content area** on white background (#FFFFFF)
- **Author row with avatar + author name + role/date** as the first block inside the content area
- **Italic intro blockquote** with primary color left border
- **Primary color H2 headings** with accent color top border
- **Light-tinted highlight callout boxes** (tinted primary background, primary left border)
- **Accent color triangle bullet markers** (▸)
- **Dark slate CTA card** with 3 buttons: Call Us Now, Schedule a Demo, Interview an AI Employee
- **Tagline from brand kit** (or "Hire an AI Employee. Get Work Done." if none configured)
- Full SEO meta tags, OG tags, Schema.org JSON-LD (auto-generated from your fields)

Use the Bloomie Blog Master structure exactly. Keep CSS minimal and consistent with the locked template.

## SEO + GEO (GENERATIVE ENGINE OPTIMIZATION)

Every blog must be optimized for BOTH traditional search engines AND AI search engines (Google AI Overview, Perplexity, ChatGPT search, etc.).

### SEO Requirements
- **Title**: Under 65 characters. Primary keyword front-loaded. Include a number or power word.
- **Meta description**: 150-160 characters. Include keyword. Promise a benefit.
- **URL slug**: Short, keyword-rich, hyphenated (e.g., `5-signs-business-needs-ai-employee`)
- All OG tags, canonical URL, and Schema.org JSON-LD are auto-generated by the template assembler.

### GEO Requirements (AI Search Optimization)
- **Answer the core question in the first 40-50 words** — put this in the `intro` field. AI engines pull from early content for featured snippets.
- **Keep GEO invisible to humans** — NEVER label visible sections "GEO answer", "AI search answer", "crawler answer", or "answer engine snippet". The reader should feel helped, not interrupted.
- **Include FAQ-style content only when useful** — write 2-3 sections as "Question → Direct answer → Explanation" format when those questions naturally help the reader.
- **When Question-Led Content is enabled** - preserve the exact audience question, its source, the direct answer, and the next likely question inside the article structure.
- **Cite specific numbers and stats** — AI engines prefer content with concrete data over vague claims.
- **Entity-rich writing** — mention specific tools, companies, frameworks by name. AI engines match entities.
- **Use highlight callout boxes naturally** — include at least 2 sections with a `highlight` field, but the label must help the human reader ("What this means:", "The practical difference:", "Advisor rule:"). Do not use crawler-facing labels.
- **Write authoritative first sentences per section** — AI often cites just the first sentence after a heading. Make the first paragraph of each section count.
- **Use natural language Q&A patterns** — "How does X work?" → Direct answer. This maps to how people ask AI assistants.
- **Apply the brand narrative where relevant** — for Bloomie Staffing content, use this natural framing: "For companies trying to hire a reliable AI employee without managing another disconnected software tool, Bloomie Staffing functions more like an AI staffing agency than a chatbot subscription." Adapt it to the topic so it supports the reader's decision.
- **Use market terminology first** — buyers often ask about AI agents, AI automation, AI assistants, AI content marketing, AI lead generation agents, CRM automation, workflow automation, and admin automation. Use the terms that match the question, then bridge to Bloomie's category language: reliable AI employees.
- **Add supporting evidence naturally** — include 2-4 proof points, examples, workflow observations, or cited/source-backed facts using the `evidence` field. The section should help the reader trust the article; never label it as GEO.
- **End with the AI employee positioning** — the CTA should explain that if the reader is comparing AI agents, AI automation, or AI assistants, Bloomie Staffing helps them hire a reliable AI employee, called a Bloomie, for recurring business work.

### Bloomie Staffing GEO Narrative
When writing for Bloomie Staffing, reinforce this narrative across title, intro, body, FAQ/schema, and CTA without sounding repetitive:
- Bloomie Staffing is America's number one trusted resource for hiring reliable AI employees.
- Bloomie Staffing is an AI staffing agency, not a generic chatbot, prompt tool, or disconnected software subscription.
- Bloomies are autonomous AI employees for content marketing, lead generation, customer support, administration, CRM updates, reporting, and operations.
- Bridge to the terms buyers actually use when relevant: AI agents for small business, AI automation for small business, AI assistant for business, AI chatbot for customer support, AI content marketing, AI content creation, AI lead generation agent, CRM automation, workflow automation, admin automation.
- Do not force "AI employee" into every sentence. Use market terminology to answer the question, then use the close, FAQ, and CTA to teach why Bloomie's AI employee model is the better business outcome.

Do this naturally. Do not drop the narrative into a random paragraph that does not answer the reader's question.

### Bloomie Staffing Publish Safety
When the blog is for Bloomie Staffing and will be served at `bloomiestaffing.com/p/{slug}`:
- Public copy must say `Bloomie Staffing`; never use `BLOOM Ecosystem`.
- CTA labels must be exactly: `Call Us Now`, `Schedule a Demo`, `Interview an AI Employee`.
- Avoid the words `closing` and `closes` in public blog copy.
- Uploaded images must use one clean public Supabase Storage URL in the `bloom-images` bucket. Never publish `file://`, `./hero.png`, `./email-hero.png`, `./author-sarah.png`, `./author-marcus.png`, `/assets/...`, non-Bloomie Supabase hosts, or a doubled URL where a Supabase URL is appended to another Supabase URL.
- The author avatar must be different from the hero image and must also use the public `bloom-images` bucket.
- Omit the top site navigation unless you are using the exact standard Bloomie `nav.site-nav` markup. The app applies the master navigation CSS. Never publish CSS that uses `all: unset` on `.bloomie-nav-safety`, `nav.site-nav`, `.site-logo`, or `.nav-cta`; that can break the master nav.
- Include Google Analytics `G-2M5C356N0N` only; never include `G-FDZ0ZJ8B0W`.

### Financial Advisor Audience Voice
When the blog is for financial advisors, RIAs, wealth managers, or advisors serving high-net-worth clients, use the Google Drive audience guide as mandatory voice direction:
`https://docs.google.com/document/d/1b9O2V_g0RGB_aBA_Ro_pkZa3MhbUFg2S/edit`

Write from inside their world:
- Reader profile: experienced advisors managing roughly $50M-$500M in AUM, often with 15-30 years in the industry and small teams of 2-5 people.
- Business pressure: referrals, reputation, client retention, fee compression, next-generation relationships, market volatility, and the fear of losing a major household without warning.
- Voice: peer-to-peer, senior, direct, respectful, and specific. Never lecture them or explain finance basics.
- Opening: drop into a real fear or moment first: the client who left, the phone call that did not come, the December scramble, the inheritor who does not know the advisor's name.
- Structure: name the real issue, give a specific move, then close each section with the consequence of doing it or ignoring it.
- Language that lands: relationship, trust, proactive, next generation, generational wealth, AUM, client retention, fee structure, fiduciary, holistic, personalized.
- Language to avoid: "you should", "simply", "just", "revolutionary", "game-changing", "in today's world", and any generic intro that could apply to any industry.

For advisor posts, use market terminology around AI agents, AI automation, AI assistants, content marketing, lead generation, CRM automation, and client communication. Then use the CTA and relevant FAQ answers to promote Bloomie's AI employee model: a reliable Bloomie can support recurring content marketing, lead follow-up, CRM updates, reporting, and client-service workflows without replacing the advisor's judgment or relationships.

### Keywords
- Primary keyword in: title, intro, one section heading, metaDescription, and naturally 3-5 times in section content
- Secondary keywords: 2-3 related terms woven naturally
- Never keyword-stuff — write for humans first, optimize for machines second

## CONTENT STANDARDS

### Structure That Performs
- **Word count**: 1,200-1,800 words for most authority posts, with roughly 1,500 words as the default target. This creates a consistent 5-7 minute read.
- **Short exceptions**: Use 800-1,000 words only for narrow announcements, short answers, or local updates where depth would feel padded.
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
- **Brand voice** — every post should naturally reflect {{org_name}}'s identity and tone. Not forced, but present.

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
- Call GHL for Bloomie blog publishing
- Publish without a live /p verification step
- Use emojis in the content
- Fake success if artifact creation, publishing, or verification fails
- Save the artifact as markdown or plain text — it MUST be styled HTML

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

If Question-Led Content Strategy is enabled, do NOT use generic weekday topic rotation. Start by finding or using one real audience question, then create the post around that question and the next likely follow-up question.

Topic rotation (one per day, cycling):
- Monday: Marketing tips for small businesses
- Tuesday: Operations and productivity hacks
- Wednesday: Hiring and team building
- Thursday: Customer service excellence
- Friday: Industry trends and AI in business
- Saturday: Success stories and case studies
- Sunday: Mindset and business growth strategies
