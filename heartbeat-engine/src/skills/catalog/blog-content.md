---
name: blog-content
description: "Write high-performing blog posts, articles, and long-form content that ranks on Google and keeps readers engaged. Use this skill whenever the task involves writing a blog post, article, thought leadership piece, how-to guide, listicle, case study, industry analysis, or any SEO content. Also triggers for content calendars, topic ideation, content briefs, and any request mentioning 'blog', 'article', 'post', 'write about', 'content', or 'SEO'. Every post should read like it was written by an expert journalist — not AI slop. Data shows well-structured posts get 250% more engagement than poorly organized content."
---

# Blog & Article Writing — Expert-Grade Content

Every blog post Sarah writes should read like it came from a paid content strategist, not a chatbot. The standard: would an editor at a respected publication approve this?

## Encoded Preferences (data-backed defaults)

### Structure That Performs
- **Word count**: 1,500-2,500 words for SEO + engagement sweet spot (Backlinko: avg page-1 result = 1,500 words)
- **Headers every 200-300 words** — readers scan in F-pattern, headers are anchor points
- **First paragraph must hook** — 55% of readers spend <15 seconds. Open with a bold claim, surprising stat, or provocative question. Never "In today's world..." or "Have you ever wondered..."
- **Answer the core question in first 40-50 words** — targets featured snippets and AI overviews
- **One H1** (title), **H2s** for major sections, **H3s** for subsections. Logical hierarchy always.
- **Short paragraphs**: 2-4 sentences max. Single-sentence paragraphs for emphasis. Walls of text = bounce.
- **Transition sentences** between sections — content should flow, not feel like disconnected blocks

### SEO Encoded Preferences
- **Title**: Under 65 characters. Primary keyword front-loaded. Include a number or power word.
  Good: "7 Proven Strategies to Double Your Email Open Rates in 2026"
  Bad: "Some Tips About Email Marketing That Might Help You"
- **Meta description**: 150-160 characters. Include keyword. Promise a benefit. End with intrigue.
- **URL slug**: Short, keyword-rich, hyphenated. `/email-open-rate-strategies` not `/7-proven-strategies-to-double-your-email-open-rates-in-2026`
- **Primary keyword**: In H1, first paragraph, one H2, and naturally 3-5 times in body. Never stuff.
- **Internal links**: 3-5 per post to related content
- **External links**: 2-3 to authoritative sources (builds E-E-A-T)
- **Images**: At least one above fold, then every 350 words. Use `image_generate` for custom visuals. Always include alt text with keywords.
- **Featured snippet format**: Answer questions directly in 40-50 words, then expand

### Writing Style
- **Active voice** — increases comprehension 25%. "We increased revenue" not "Revenue was increased"
- **Second person** — "you" and "your" create direct connection with reader
- **Conversational but authoritative** — like a smart friend explaining something, not a textbook
- **Data-backed claims** — "Content with data gets 300% more engagement" (Content Research Institute). Never make unsubstantiated claims.
- **Specific over vague** — "increased conversions by 34%" not "significantly improved results"
- **Break patterns** — use questions, bold statements, short paragraphs, and callout boxes to prevent monotony
- **Stories and examples** — abstract advice is forgettable, concrete examples stick

### Blog Post Template (default structure)
```
# [Compelling Title with Number or Power Word] (H1)

[Hook paragraph — bold claim, stat, or question. 2-3 sentences max.]

[Bridge paragraph — what the reader will learn. Set expectations.]

## [Section 1: Core Concept] (H2)
[Explain the main idea. Lead with the answer, then expand.]

### [Subsection if needed] (H3)
[Supporting detail, example, or data point.]

## [Section 2: How-To / Steps / Framework] (H2)
[Actionable content. This is where the value lives.]

## [Section 3: Examples / Case Studies] (H2)
[Real-world proof. Stories are 22x more memorable than facts alone.]

## [Section 4: Common Mistakes / Pitfalls] (H2)
[What to avoid. Readers love "don't do this" content.]

## [Conclusion / Next Steps] (H2)
[Summarize key takeaways. End with a clear CTA.]
```

### What to NEVER do
- Start with "In today's fast-paced world..." or any cliché opener
- Write in passive voice for entire sections
- Use filler phrases: "It's important to note that", "It goes without saying"
- Produce thin content under 800 words for SEO-targeted posts
- Skip the meta description
- Forget internal/external links
- Use generic stock photo descriptions for image generation
- Write conclusions that just repeat the intro

### Delivery
- Save as `.md` artifact with `create_artifact`
- Include suggested meta title, meta description, and URL slug at the top
- If client's blog platform is known, format accordingly

### Brand Kit Integration
- If a Brand Kit is in the system prompt, use those colors for any HTML formatting, headers, and callout boxes
- Match the Brand Kit voice/tone throughout the writing
- Use Brand Kit fonts if generating styled HTML blog posts
- If no Brand Kit is available, use the writing style defaults above
