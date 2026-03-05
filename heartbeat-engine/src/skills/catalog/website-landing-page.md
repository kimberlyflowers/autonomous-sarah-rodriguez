---
name: website-landing-page
description: "Design and build websites, landing pages, sales pages, and web mockups that convert visitors into leads. Use when the task involves creating a website, landing page, sales page, opt-in page, booking page, webinar registration page, or any web presence. Also triggers for website redesigns, page mockups, and conversion optimization."
---

# Website & Landing Page Design

## How to Think About This

A landing page has ONE job: get the visitor to take ONE action. Every word, every image, every section either moves them toward that action or distracts them from it. If you can't name the single action in one sentence, the page will fail.

Before writing a single line of code, answer these three questions:
1. Who is landing on this page? (Where did they come from? What do they already know?)
2. What is the ONE thing we want them to do? (Book a call, sign up, buy, download)
3. What is their biggest objection? (Cost? Trust? Time? "Is this legit?")

Pull from the client's memory and Company Skills for brand colors, voice, audience details, and industry context.

## The Above-the-Fold Section (Hero)

This is the only section guaranteed to be seen. It must do three things in under 5 seconds:

1. **Headline:** State the transformation, not the product. "Stop losing clients to missed follow-ups" beats "AI-Powered CRM Assistant." The headline should make the visitor think "that's exactly my problem."

2. **Subheadline:** One sentence that explains HOW. "Your AI employee handles every lead, every follow-up, every appointment — so nothing falls through the cracks."

3. **CTA Button:** Action-oriented, specific, low-friction. "See It In Action" beats "Submit." "Book My Free Demo" beats "Contact Us." The button text should complete the sentence "I want to ___."

NEVER put a navigation menu with 8 links on a landing page. Every link is an exit. Landing pages have ONE path: down the page to the CTA.

## Page Structure That Converts

### Section 1: Hero (above the fold)
- Headline (transformation-focused)
- Subheadline (how it works, one sentence)
- CTA button (primary action)
- Optional: hero image, product screenshot, or short video

### Section 2: Problem Agitation
- Name the pain the visitor is experiencing
- Be specific — use their language, their frustrations
- "You know the feeling: it's 10pm and you realize you forgot to follow up with that hot lead from Tuesday."
- This section exists to make them nod and think "yes, that's me"

### Section 3: Solution / How It Works
- 3 steps max. Simple. Visual.
- Step 1: "Tell Sarah what you need"
- Step 2: "She handles it autonomously"
- Step 3: "You review the results"
- Icons or illustrations for each step. Never a wall of text.

### Section 4: Social Proof
- Testimonials with NAMES and PHOTOS (or at minimum, first name + role)
- Specific results: "Sarah saved me 15 hours a week" > "Great product!"
- If no testimonials yet, use: metrics, case study preview, "trusted by X companies", or logos

### Section 5: Features/Benefits
- Benefits, not features. "Never miss a follow-up" not "Automated email sequences"
- 3-6 items max. Each one is a mini pain→solution
- Icon + short headline + one sentence

### Section 6: Objection Handling
- FAQ section or direct objection addressing
- "But what about..." for the top 3-4 concerns
- Cost, security, complexity, "will it actually work for MY business"
- Answer honestly and specifically

### Section 7: Final CTA
- Repeat the primary CTA
- Add urgency only if it's REAL (limited spots, launch pricing, deadline)
- Restate the transformation: "Ready to stop losing leads?"

## Design Principles

### Typography
- One font family max (with weight variations for hierarchy)
- Headlines: bold, large (36-48px), high contrast
- Body: regular weight, comfortable reading size (16-18px)
- Line height: 1.5-1.7 for body text

### Color
- Use the client's brand colors as primary
- One accent color for CTAs (high contrast against the background)
- CTA buttons should be the MOST visually prominent element on the page
- Dark text on light background for readability (or vice versa for dark themes)
- If no brand colors given: default to clean whites, deep navy text, and a warm accent (coral, amber, or green) for CTAs

### Spacing
- Generous whitespace between sections (80-120px)
- Don't cram content. Breathing room signals quality.
- Mobile-first: everything must work on a phone screen

### Images
- Real photos > stock photos > illustrations > no images
- If using stock: avoid the generic "business people shaking hands" look
- Screenshots of the actual product are the highest-converting image type
- Optimize for fast loading — a slow page kills conversions

## Technical Output

When creating a website mockup or landing page, output as a single HTML file with:
- Inline CSS (no external stylesheets)
- Mobile-responsive (use media queries or flexible units)
- Google Fonts loaded via CDN if custom fonts needed
- Smooth scroll behavior
- CTA buttons that stand out visually
- Clean, semantic HTML

Use `create_artifact` to deliver the HTML file so the client can preview it immediately.

## Common Mistakes to Avoid

- Navigation menus on landing pages (every link is an exit)
- Multiple CTAs competing for attention (pick ONE action)
- Headlines about the company instead of the visitor's problem
- No social proof section
- CTA buttons that say "Submit" or "Click Here"
- Walls of text with no visual breaks
- Forgetting mobile responsiveness
- Generic stock photos that don't match the brand
- Not addressing the main objection directly
- Putting the CTA only at the bottom (repeat it at least twice)
- Using the client's internal jargon instead of the visitor's language
