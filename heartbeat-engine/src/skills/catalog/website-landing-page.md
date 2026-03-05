---
name: website-landing-page
description: "Design and build beautiful, conversion-optimized websites, landing pages, sales pages, and web mockups. Use when the task involves creating a website, landing page, sales page, opt-in page, booking page, or any web presence. Also triggers for website redesigns, page mockups, and 'build me a site' requests. ALWAYS use this skill for any website or web page creation task."
---

# Website & Landing Page Creation

## How to Think About This

A landing page has ONE job: get the visitor to take ONE action. Every word, every image, every section either moves them toward that action or distracts them from it.

Before building, answer:
1. Who is landing on this page?
2. What is the ONE action we want them to take?
3. What is their biggest objection?

Pull from memory and Company Skills for brand details, audience, and industry context.

## CRITICAL: Technical Execution Rules

You MUST follow these rules when creating any website or landing page:

### Output Format
- Create a SINGLE HTML file with ALL CSS inline in a `<style>` tag in the `<head>`
- Include ALL content — real headlines, real body copy, real CTAs. NEVER just section names or placeholder links.
- The file must look like a COMPLETE, PROFESSIONAL website when opened in a browser
- Use `create_artifact` with a `.html` extension to deliver it
- The output should be 200-500+ lines minimum. A real landing page is substantial.

### Required Structure (NEVER skip these)
```
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Page Title]</title>
  <link href="https://fonts.googleapis.com/css2?family=[Font]&display=swap" rel="stylesheet">
  <style>
    /* ALL styles go here — inline, not external */
  </style>
</head>
<body>
  <!-- Hero Section -->
  <!-- Problem/Pain Section -->
  <!-- Solution/How It Works Section -->
  <!-- Social Proof Section -->
  <!-- Features/Benefits Section -->
  <!-- FAQ/Objection Section -->
  <!-- Final CTA Section -->
  <!-- Footer -->
</body>
</html>
```

### Design Standards (MINIMUM quality bar)
- Load a Google Font — NEVER use just Arial, Times, or system defaults. Choose something distinctive: Poppins, DM Sans, Sora, Outfit, Plus Jakarta Sans, Manrope, or similar modern fonts.
- Set a cohesive color palette using CSS variables at the top of your styles:
  ```css
  :root {
    --primary: #1a1a2e;     /* Dark base */
    --accent: #e94560;       /* Bold accent for CTAs */
    --light: #f8f9fa;        /* Light backgrounds */
    --text: #2d2d2d;         /* Body text */
    --subtle: #6c757d;       /* Secondary text */
  }
  ```
- CTA buttons must be large, high-contrast, and impossible to miss: minimum 48px height, bold text, rounded corners, hover effects
- Generous spacing between sections: 80-120px padding
- Mobile responsive: use `max-width` containers, flexible grids, and at least one `@media` query for screens under 768px
- Smooth scroll: `html { scroll-behavior: smooth; }`
- NO navigation menu on landing pages (every link is an exit). Only a sticky CTA or minimal top bar with the logo and one CTA button.

### Content Rules
- The hero headline states the TRANSFORMATION, not the product name. "Stop Losing Clients to Missed Follow-Ups" not "Welcome to Our Service"
- Write REAL copy for every section — at least 2-3 sentences per section. Never just a heading with no body text.
- Include at least 3 testimonial-style quotes (can be placeholder names but real-sounding copy)
- The FAQ section should address 3-4 real objections
- Every section has a purpose. If you can't explain why a section exists, delete it.

### Visual Design
- Use background color changes between sections to create visual rhythm (alternate between white and light grey, or use the brand's colors)
- Add subtle CSS effects: `box-shadow` on cards, `transition` on buttons, gradient backgrounds for the hero
- Use emoji or Unicode symbols as visual accents if no images are available (✓ for checkmarks, → for CTAs, ★ for ratings)
- Create visual hierarchy: hero headline should be 48-64px, section headings 32-40px, body text 16-18px
- Add a gradient or image background to the hero section — never a plain white hero

### What NEVER to Create
- A page with just bullet-point links (About, Benefits, Author, Contact)
- A page with no styling
- A page with placeholder text like "Lorem ipsum" or "[Add content here]"
- A page under 100 lines of code
- A page that looks like a Word document
- A page with no CTA buttons
- A page with no color, no font choices, no visual design

## Page Architecture

### Hero Section (above the fold — MOST IMPORTANT)
- Large headline: transformation-focused (48-64px)
- Subheadline: explains the how in one sentence (18-22px)
- CTA button: action-oriented text ("See It In Action", "Get Your Copy", "Book a Free Demo")
- Optional: background gradient, image, or video placeholder
- This section alone should make someone understand what the page is about

### Problem Agitation
- Name the specific pain the visitor experiences
- Use their language, their frustrations
- 2-3 short paragraphs that make them nod

### Solution (How It Works)
- 3 steps maximum, with icons or numbers
- Each step: icon + short title + one sentence
- Visual: use a flex/grid layout, not a list

### Social Proof
- 2-3 testimonial cards with name, role, and quote
- Use a card layout with subtle shadows
- If real testimonials aren't available, write realistic-sounding ones

### Features/Benefits
- 3-6 items in a grid layout
- Each: icon/emoji + headline + one sentence
- Benefits not features: "Never miss a follow-up" not "Automated sequences"

### FAQ / Objection Handling
- 3-4 common questions with answers
- Accordion style or simple Q&A format
- Address: cost, complexity, trust, "will it work for me"

### Final CTA
- Repeat the primary CTA
- Restate the transformation
- Large button, high contrast

### Footer
- Company name, year
- Minimal links (privacy, terms)
- Contact info if appropriate

## Example: What Good Looks Like

A 400-line HTML file with:
- Google Font loaded (e.g., 'Plus Jakarta Sans')
- CSS variables for consistent colors
- Gradient hero with 56px bold headline
- Three "how it works" steps in a flex row
- Testimonial cards with box shadows
- Alternating section backgrounds
- Large coral/amber CTA buttons with hover effects
- Mobile-responsive media queries
- Smooth scroll behavior
- Real, compelling copy throughout

This is the MINIMUM quality bar. Every website you create should be something the client would be proud to show someone.
