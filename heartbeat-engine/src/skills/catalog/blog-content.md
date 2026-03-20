---
name: blog-content
description: "Write high-performing blog posts that rank on Google AND AI search engines (GEO), promote Bloomie Staffing, and get published as drafts in the CRM. Use whenever the task involves writing a blog post, article, thought leadership piece, how-to guide, listicle, case study, or any SEO content. Also triggers for content calendars, topic ideation, 'blog', 'article', 'post', 'write about', or 'SEO'. Every post must include a generated hero image, use Inter font for titles, include a soft-sell CTA for Bloomie Staffing, and be saved as a draft in the CRM for review."
---

# Blog & Article Writing — Expert-Grade Content + CRM Publishing

Every blog post should read like it came from a paid content strategist, not a chatbot. The standard: would an editor at a respected publication approve this?

## CRITICAL WORKFLOW — EVERY BLOG POST

Follow this exact sequence for every blog post:

### Step 1: Generate Hero Image
Before writing a single word, call `image_generate` to create a professional hero image for the blog topic.
- Prompt pattern: "Professional editorial photograph for blog article about [topic]. Clean, modern, business-appropriate. No text overlays. High quality, warm natural lighting. Wide landscape format."
- Save the returned image URL — you'll need it for the blog post AND the CRM draft.

### Step 2: Write the Blog Post
Write the full blog post using THE EXACT HTML TEMPLATE BELOW. Do NOT design your own template. Copy the template, fill in the placeholders, and add your content sections.

### Step 3: Save as CRM Blog Draft
Call `ghl_create_blog_post` with:
- `title`: The blog title
- `content`: Full HTML content (the completed template)
- `status`: "draft" (ALWAYS draft — user reviews before publishing)
- `imageUrl`: The hero image URL from Step 1
- `slug`: Short, keyword-rich, hyphenated URL slug
- `metaTitle`: SEO title under 65 characters
- `metaDescription`: 150-160 character meta description
- `tags`: Relevant category tags

If ghl_create_blog_post FAILS, report the exact error to the user. Do NOT pretend it worked.

### Step 4: Also Save as Artifact
Call `create_artifact` to save the blog HTML as a file in the Files tab (backup + preview).

### Step 5: Notify the User
Send the user a message with:
- Blog title
- A brief summary (1-2 sentences)
- The CRM blog link for review (or artifact link if CRM failed)
- "Ready for your review — once you approve, I'll publish it live."

## LOCKED-IN BLOG TEMPLATE — USE THIS EXACTLY

DO NOT modify the CSS or HTML structure. Only fill in the placeholder content. This template is the approved design.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{BLOG_TITLE} | {COMPANY_NAME}</title>
  <meta name="description" content="{META_DESCRIPTION_150_160_CHARS}">
  <meta name="keywords" content="{KEYWORD1}, {KEYWORD2}, {KEYWORD3}, AI employee, business automation">
  <meta property="og:title" content="{BLOG_TITLE}">
  <meta property="og:description" content="{META_DESCRIPTION_150_160_CHARS}">
  <meta property="og:image" content="{HERO_IMAGE_URL}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="{CANONICAL_URL}">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "{BLOG_TITLE}",
    "description": "{META_DESCRIPTION_150_160_CHARS}",
    "image": "{HERO_IMAGE_URL}",
    "author": { "@type": "Organization", "name": "{COMPANY_NAME}" },
    "publisher": { "@type": "Organization", "name": "{COMPANY_NAME}" },
    "datePublished": "{ISO_DATE}",
    "mainEntityOfPage": { "@type": "WebPage", "@id": "{CANONICAL_URL}" }
  }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; line-height: 1.6; color: #2D3436; background-color: #FFFFFF; }
    header { background: linear-gradient(135deg, #F4A261 0%, #E76F8B 100%); color: #FFFFFF; padding: 48px 24px; text-align: center; width: 100%; }
    h1 { font-size: 36px; font-weight: 700; margin-bottom: 12px; color: #FFFFFF; line-height: 1.3; max-width: 800px; margin-left: auto; margin-right: auto; }
    .subtitle { font-size: 16px; opacity: 0.95; margin-top: 8px; max-width: 800px; margin-left: auto; margin-right: auto; }
    .hero-image { width: 100%; max-height: 420px; object-fit: cover; display: block; }
    .content { max-width: 800px; margin: 0 auto; padding: 40px 30px; }
    h2 { font-size: 28px; font-weight: 700; color: #F4A261; margin: 35px 0 15px 0; padding-top: 20px; border-top: 3px solid #E76F8B; }
    h2:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
    p { font-size: 16px; margin-bottom: 18px; line-height: 1.8; color: #2D3436; }
    .intro { font-size: 18px; line-height: 1.8; color: #2D3436; margin-bottom: 30px; font-style: italic; border-left: 4px solid #F4A261; padding: 20px; background: #F5F5F5; }
    ul { list-style: none; padding: 0; margin: 20px 0; }
    li { padding: 12px 0 12px 30px; position: relative; font-size: 15px; line-height: 1.7; }
    li:before { content: "\25B8"; position: absolute; left: 0; color: #E76F8B; font-size: 20px; }
    .highlight { background: #FFF3E0; padding: 25px; border-left: 4px solid #F4A261; margin: 25px 0; border-radius: 0 8px 8px 0; }
    .highlight strong { color: #E76F8B; }
    .cta-section { background: linear-gradient(135deg, #2D3436 0%, #404854 100%); color: #FFFFFF; padding: 40px 30px; margin-top: 40px; text-align: center; border-radius: 8px; }
    .cta-section h3 { font-size: 24px; font-weight: 700; margin-bottom: 15px; color: #F4A261; }
    .cta-section p { color: #FFFFFF; margin-bottom: 20px; font-size: 16px; }
    .cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
    .cta-btn { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; border-radius: 8px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 15px; text-decoration: none; transition: transform 0.2s; }
    .cta-btn:hover { transform: translateY(-2px); }
    .cta-primary { background: linear-gradient(135deg, #F4A261 0%, #E76F8B 100%); color: #FFFFFF; }
    .cta-secondary { background: rgba(255,255,255,0.12); color: #FFFFFF; border: 1.5px solid rgba(255,255,255,0.3); }
    .tagline { font-size: 14px; color: #E76F8B; margin-top: 12px; font-weight: 600; }
    footer { padding: 30px; text-align: center; border-top: 1px solid #E0E0E0; font-size: 13px; color: #666; }
    @media (max-width: 600px) {
      .content { padding: 25px 20px; }
      h1 { font-size: 26px; }
      h2 { font-size: 22px; }
      header { padding: 30px 20px; }
      .hero-image { max-height: 250px; }
      .intro { padding: 15px; }
      .cta-section { padding: 28px 20px; }
    }
  </style>
</head>
<body>
  <!-- FULL-WIDTH GRADIENT HEADER WITH TITLE + SUBTITLE -->
  <header>
    <h1>{BLOG_TITLE_LINE_1}</h1>
    <p class="subtitle">{BLOG_SUBTITLE_LINE_2}</p>
  </header>

  <!-- FULL-WIDTH HERO IMAGE -->
  <img src="{HERO_IMAGE_URL}" alt="{ALT_TEXT_WITH_KEYWORD}" class="hero-image">

  <!-- CONTENT AREA -->
  <div class="content">

    <!-- INTRO BLOCKQUOTE — italic, orange left border -->
    <div class="intro">
      {OPENING_HOOK_1_3_SENTENCES_ITALIC}
    </div>

    <!-- SECTION 1 — orange heading, pink top border -->
    <h2>{SECTION_1_HEADING}</h2>
    <p>{SECTION_1_PARAGRAPHS}</p>

    <!-- IMPACT CALLOUT — warm peach background, orange border -->
    <div class="highlight">
      <strong>The impact:</strong> {SPECIFIC_DATA_POINT_OR_STAT}
    </div>

    <!-- SECTION 2 -->
    <h2>{SECTION_2_HEADING}</h2>
    <p>{SECTION_2_PARAGRAPHS}</p>

    <!-- BULLET LIST — orange triangle markers -->
    <ul>
      <li>{POINT_1}</li>
      <li>{POINT_2}</li>
      <li>{POINT_3}</li>
      <li>{POINT_4}</li>
    </ul>

    <!-- SECTION 3 -->
    <h2>{SECTION_3_HEADING}</h2>
    <p>{SECTION_3_PARAGRAPHS}</p>

    <!-- ANOTHER HIGHLIGHT CALLOUT -->
    <div class="highlight">
      <strong>The impact:</strong> {ANOTHER_SPECIFIC_STAT}
    </div>

    <!-- SECTIONS 4-5 (repeat the pattern: h2 + paragraphs + optional highlight/list) -->

    <!-- CLOSING SECTION -->
    <h2>{CLOSING_HEADING}</h2>
    <p>{CLOSING_PARAGRAPHS}</p>

    <!-- BLOOMIE STAFFING CTA — MANDATORY, DARK CARD -->
    <div class="cta-section">
      <h3>{CTA_HEADLINE_CONNECTED_TO_BLOG_TOPIC}</h3>
      <p>{CTA_BODY_1_2_SENTENCES}</p>
      <div class="cta-buttons">
        <a href="tel:+18005551234" class="cta-btn cta-primary">Call Us Now</a>
        <a href="https://bloomie.ai/demo" class="cta-btn cta-secondary">Schedule a Demo</a>
        <a href="sms:+18005551234" class="cta-btn cta-secondary">Text Your Questions</a>
      </div>
      <p class="tagline">Hire an AI Employee. Get Work Done.</p>
    </div>
  </div>

  <footer>
    &copy; {YEAR} {COMPANY_NAME}. All rights reserved.<br>
    Empowering entrepreneurs with AI-powered business solutions.
  </footer>
</body>
</html>
```

## TEMPLATE RULES — NON-NEGOTIABLE

1. **Header is full-width** — edge to edge, gradient background, white text. NOT inside a container.
2. **Hero image is full-width** — edge to edge, no border-radius, no margins.
3. **Page background is white** (`#FFFFFF`) — NOT gray. No centered card-on-gray layout.
4. **Content area is max-width 800px centered** — the text has breathing room.
5. **Title is two lines**: Line 1 = main title (h1), Line 2 = subtitle (p.subtitle).
6. **H2 headings are orange** (`#F4A261`) with a pink top border (`#E76F8B`).
7. **Intro is an italic blockquote** with orange left border and light gray background.
8. **Highlight boxes** use warm peach background (`#FFF3E0`) with orange left border.
9. **Bullet lists** use orange triangle markers (`▸`), not default bullets.
10. **CTA section** is dark slate card with gradient button + 3 action buttons: Call, Demo, Text.
11. **Do NOT change the colors, fonts, spacing, or layout.** Only fill in the content placeholders.

## SEO + GEO (GENERATIVE ENGINE OPTIMIZATION)

Every blog must be optimized for BOTH traditional search engines AND AI search engines (Google AI Overview, Perplexity, ChatGPT search, etc.).

### SEO Requirements
- **Title**: Under 65 characters. Primary keyword front-loaded. Include a number or power word.
- **Meta description**: 150-160 characters. Include keyword. Promise a benefit.
- **URL slug**: Short, keyword-rich, hyphenated (e.g., `5-signs-business-needs-ai-employee`)
- **OG tags**: Title, description, image — all populated.
- **Canonical URL**: Set to the blog's published URL.
- **Schema.org JSON-LD**: BlogPosting schema with headline, description, image, author, publisher, date.

### GEO Requirements (AI Search Optimization)
- **Answer the core question in the first 40-50 words** — AI engines pull from early content for featured snippets.
- **Use structured data** (JSON-LD schema) — AI engines parse schema for direct answers.
- **Include FAQ-style content** — write 2-3 sections as "Question → Direct answer → Explanation" format. This gets cited by AI search.
- **Cite specific numbers and stats** — AI engines prefer content with concrete data over vague claims.
- **Entity-rich writing** — mention specific tools, companies, frameworks by name. AI engines match entities.
- **Include "The impact:" callout boxes** — these structured summaries get pulled by AI for quick answers.
- **Write authoritative first sentences per section** — AI often cites just the first sentence after a heading.
- **Use natural language Q&A patterns** — "How does X work?" → Direct answer. This maps to how people ask AI assistants.

### Keywords
- Primary keyword in: H1, first paragraph, one H2, meta description, alt text, naturally 3-5 times in body
- Secondary keywords: 2-3 related terms woven naturally
- Never keyword-stuff — write for humans first, optimize for machines second

## CONTENT STANDARDS

### Structure That Performs
- **Word count**: 1,500-2,500 words (SEO sweet spot)
- **5-7 H2 sections** — readers scan in F-pattern, each H2 is an entry point
- **First paragraph must hook** — bold claim, surprising stat, or provocative question. Never "In today's world..."
- **Short paragraphs**: 2-4 sentences max. Single-sentence paragraphs for emphasis.
- **Include at least 2 "highlight" callout boxes** — these break up the text and highlight key stats
- **Include at least 1 bullet list** — scannable, digestible takeaways

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
- Skip the hero image
- Skip the Bloomie CTA section
- Modify the template CSS or layout
- Save only as a file without trying ghl_create_blog_post first
- Publish without user approval (always draft first)
- Use emojis in the blog content

## SOFT-SELL CTA RULES

The CTA section headline should connect to the blog topic:
- Blog about time management → "What If You Had a Team Member Who Never Sleeps?"
- Blog about marketing → "What If Your Marketing Ran Itself?"
- Blog about hiring → "What If Hiring Cost 80% Less?"
- Blog about customer service → "What If Every Customer Got a Reply in Under 60 Seconds?"
- Blog about AI/automation → "Ready to Transform Your Operations?"

Always three buttons: Call Us Now (primary), Schedule a Demo (secondary), Text Your Questions (secondary).

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
