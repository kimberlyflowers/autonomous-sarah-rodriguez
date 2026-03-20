---
name: blog-content
description: "Write high-performing blog posts that rank on Google, promote Bloomie Staffing, and get published as drafts in the CRM. Use whenever the task involves writing a blog post, article, thought leadership piece, how-to guide, listicle, case study, or any SEO content. Also triggers for content calendars, topic ideation, 'blog', 'article', 'post', 'write about', or 'SEO'. Every post must include a generated hero image, use Inter font for titles, include a soft-sell CTA for Bloomie Staffing, and be saved as a draft in the CRM for review."
---

# Blog & Article Writing — Expert-Grade Content + CRM Publishing

Every blog post should read like it came from a paid content strategist, not a chatbot. The standard: would an editor at a respected publication approve this?

## CRITICAL WORKFLOW — EVERY BLOG POST

Follow this exact sequence for every blog post:

### Step 1: Generate Hero Image
Before writing a single word, call `image_generate` to create a professional hero image for the blog topic.
- Prompt pattern: "Professional editorial photograph for blog article about [topic]. Clean, modern, business-appropriate. No text overlays. High quality, warm natural lighting."
- Save the returned image URL — you'll need it for the blog post AND the CRM draft.

### Step 2: Write the Blog Post
Write the full blog post following all the rules below. Format as styled HTML (not markdown) so it renders correctly in the CRM blog page.

### Step 3: Save as CRM Blog Draft
Call `ghl_create_blog_post` with:
- `title`: The blog title
- `content`: Full HTML content (with Inter font headings, hero image embedded, CTA section)
- `status`: "draft" (ALWAYS draft — user reviews before publishing)
- `imageUrl`: The hero image URL from Step 1
- `slug`: Short, keyword-rich, hyphenated URL slug
- `metaTitle`: SEO title under 65 characters
- `metaDescription`: 150-160 character meta description
- `tags`: Relevant category tags

### Step 4: Also Save as Artifact
Call `create_artifact` to save the blog HTML as a file in the Files tab (backup + preview).

### Step 5: Notify the User
Send the user a message with:
- Blog title
- A brief summary (1-2 sentences)
- The CRM blog link for review
- "Ready for your review — once you approve, I'll publish it live."

## TITLE FONT — MANDATORY

**Font: Inter, Bold 700** — This is the standard for ALL blog titles and headings.

Every blog HTML must include this in the `<head>` or inline styles:
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
```

Title styling:
```css
h1 { font-family: 'Inter', system-ui, -apple-system, sans-serif; font-weight: 800; font-size: 42px; line-height: 1.15; color: #1a1a1a; margin-bottom: 16px; }
h2 { font-family: 'Inter', system-ui, -apple-system, sans-serif; font-weight: 700; font-size: 28px; line-height: 1.3; color: #1a1a1a; margin-top: 40px; margin-bottom: 12px; }
h3 { font-family: 'Inter', system-ui, -apple-system, sans-serif; font-weight: 600; font-size: 20px; line-height: 1.4; color: #333; margin-top: 28px; margin-bottom: 8px; }
```

Body text: `font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-size: 18px; line-height: 1.75; color: #333;`

## BLOG HTML TEMPLATE

Every blog post must follow this HTML structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{BLOG_TITLE}</title>
  <meta name="description" content="{META_DESCRIPTION}">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 18px; line-height: 1.75; color: #333; background: #fff; }
    .blog-container { max-width: 740px; margin: 0 auto; padding: 40px 20px 80px; }
    .blog-hero { width: 100%; max-height: 440px; object-fit: cover; border-radius: 12px; margin-bottom: 32px; }
    h1 { font-weight: 800; font-size: 42px; line-height: 1.15; color: #1a1a1a; margin-bottom: 16px; }
    h2 { font-weight: 700; font-size: 28px; line-height: 1.3; color: #1a1a1a; margin-top: 48px; margin-bottom: 16px; }
    h3 { font-weight: 600; font-size: 20px; line-height: 1.4; color: #333; margin-top: 32px; margin-bottom: 10px; }
    p { margin-bottom: 20px; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    blockquote { border-left: 4px solid #F4A261; padding: 16px 24px; margin: 28px 0; background: #fef9f4; border-radius: 0 8px 8px 0; font-style: italic; color: #555; }
    ul, ol { margin: 16px 0 20px 28px; }
    li { margin-bottom: 8px; }
    .cta-section { background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 16px; padding: 48px 32px; text-align: center; margin-top: 56px; color: #fff; }
    .cta-section h2 { color: #fff; margin-top: 0; font-size: 28px; }
    .cta-section p { color: rgba(255,255,255,0.85); font-size: 16px; }
    .cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 24px; }
    .cta-btn { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; border-radius: 10px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 15px; text-decoration: none; transition: transform 0.2s; }
    .cta-btn:hover { transform: translateY(-2px); }
    .cta-primary { background: linear-gradient(135deg, #F4A261, #E76F8B); color: #fff; }
    .cta-secondary { background: rgba(255,255,255,0.15); color: #fff; border: 1.5px solid rgba(255,255,255,0.3); }
    @media (max-width: 600px) { h1 { font-size: 28px; } h2 { font-size: 22px; } .blog-container { padding: 24px 16px 60px; } .cta-section { padding: 32px 20px; } }
  </style>
</head>
<body>
  <div class="blog-container">
    <img src="{HERO_IMAGE_URL}" alt="{ALT_TEXT}" class="blog-hero">
    <h1>{BLOG_TITLE}</h1>

    <!-- BLOG CONTENT HERE -->

    <!-- BLOOMIE STAFFING CTA — MANDATORY ON EVERY BLOG -->
    <div class="cta-section">
      <h2>Stop Drowning in Tasks. Start Growing Your Business.</h2>
      <p>Bloomie AI employees handle your marketing, content, customer service, and operations — so you can focus on what matters. Part-time or full-time, starting at a fraction of a traditional hire.</p>
      <div class="cta-buttons">
        <a href="tel:+1XXXXXXXXXX" class="cta-btn cta-primary">Call Us Now</a>
        <a href="https://bloomie.ai/demo" class="cta-btn cta-secondary">Schedule a Demo</a>
        <a href="sms:+1XXXXXXXXXX" class="cta-btn cta-secondary">Text Your Questions</a>
      </div>
    </div>
  </div>
</body>
</html>
```

## SOFT-SELL CTA RULES — EVERY BLOG

Every blog post MUST end with a Bloomie Staffing CTA section. This is NOT optional.

The CTA should feel like a natural extension of the blog content, not a jarring ad. Connect the blog topic to Bloomie's value proposition:
- If the blog is about time management → "What if you had a team member who never sleeps?"
- If the blog is about marketing → "What if your marketing ran itself?"
- If the blog is about hiring → "What if hiring cost 80% less?"

Three CTA options always present:
1. **Call** — "Call Us Now" (primary, gradient button)
2. **Schedule Demo** — "Schedule a Demo" (secondary)
3. **Text** — "Text Your Questions" (secondary)

## CONTENT STANDARDS

### Structure That Performs
- **Word count**: 1,500-2,500 words (SEO sweet spot)
- **Headers every 200-300 words** — readers scan in F-pattern
- **First paragraph must hook** — bold claim, surprising stat, or provocative question. Never "In today's world..."
- **Answer the core question in first 40-50 words** — targets featured snippets
- **Short paragraphs**: 2-4 sentences max. Single-sentence paragraphs for emphasis.

### SEO Requirements
- **Title**: Under 65 characters. Primary keyword front-loaded. Include a number or power word.
- **Meta description**: 150-160 characters. Include keyword. Promise a benefit.
- **URL slug**: Short, keyword-rich, hyphenated
- **Primary keyword**: In H1, first paragraph, one H2, and naturally 3-5 times
- **Images**: Hero image above fold + at least one more mid-article (use image_generate)
- **Alt text**: Descriptive, include keyword naturally

### Writing Style
- **Active voice** always
- **Second person** — "you" and "your"
- **Conversational but authoritative** — like a smart friend explaining something
- **Data-backed claims** with specific numbers
- **Stories and examples** — concrete beats abstract

### What to NEVER Do
- Start with "In today's fast-paced world..." or any cliche
- Write in passive voice
- Use filler phrases: "It's important to note that", "It goes without saying"
- Produce thin content under 800 words
- Skip the hero image
- Skip the Bloomie CTA section
- Use emojis in the blog content
- Save only as a file without creating the CRM draft
- Publish without user approval (always draft first)

## DAILY BLOG AUTOMATION

When running on autopilot (daily blog task), choose topics that:
1. Target small business owners (10-50 employees)
2. Address pain points Bloomie solves (hiring, marketing, ops, customer service)
3. Provide genuine value first, soft-sell second
4. Vary format: how-to guides, listicles, case studies, industry analysis, myth-busting
5. Use seasonal/trending angles when relevant

Topic rotation (one per day, cycling):
- Monday: Marketing tips for small businesses
- Tuesday: Operations and productivity hacks
- Wednesday: Hiring and team building
- Thursday: Customer service excellence
- Friday: Industry trends and AI in business
- Saturday: Success stories and case studies
- Sunday: Mindset and business growth strategies
