---
name: email-creator
description: "Create professional marketing emails, newsletters, blog announcement emails, and campaign emails. Use whenever the task involves creating an email, newsletter, campaign email, blog promotion email, drip sequence email, or any email content to be sent to a list. Also triggers for 'email', 'newsletter', 'campaign', 'send to list', 'email blast', 'announce blog', 'promote blog', or 'email marketing'. Every email is saved as a DRAFT in the CRM for user review before sending. Includes a generated hero image, Inter font headings, single-column mobile-first layout, and a soft-sell Bloomie Staffing CTA."
---

# Email Creator — Draft-First CRM Email Pipeline

Every email should feel like it came from a real person who gives a damn — not a mass-blast template. The standard: would you open this email AND read to the end?

## CRITICAL WORKFLOW — EVERY EMAIL

Follow this exact sequence for every email:

### Step 1: Generate Hero Image
Before writing, call `image_generate` to create a professional hero image for the email topic.
- Prompt pattern: "Professional editorial photograph for email about [topic]. Clean, modern, business-appropriate. No text overlays. High quality, warm natural lighting. 600x300 aspect ratio."
- Save the returned image URL — you'll need it for the email AND the CRM draft.

### Step 2: Write the Email
Write the full email using THE EXACT HTML TEMPLATE BELOW. Do NOT design your own template. Copy the template, fill in the placeholders, and add your content sections.

### Step 3: Save as CRM Email Draft
Call `ghl_create_email_template` with:
- `name`: Descriptive internal name (e.g., "Blog Announcement - 5 Hiring Mistakes - Mar 2026")
- `subject`: Optimized subject line (6-10 words, front-load value)
- `previewText`: First 90 characters preview text that complements the subject
- `html`: Full HTML email content (the completed template)
- `imageUrl`: The hero image URL from Step 1
- `type`: One of: "newsletter", "promotional", "welcome", "re-engagement", "blog-announcement"
- `tags`: Relevant tags

If ghl_create_email_template FAILS, report the exact error to the user. Do NOT pretend it worked.

### Step 4: Also Save as Artifact
Call `create_artifact` to save the email HTML as a file in the Files tab (backup + preview).

### Step 5: Notify the User
Send the user a message with:
- Email subject line
- A brief summary (1-2 sentences of what the email covers)
- The CRM email draft link for review (or artifact link if CRM failed)
- "Ready for your review — once you approve, I'll send it to your list."

## LOCKED-IN EMAIL TEMPLATE — USE THIS EXACTLY

DO NOT modify the CSS or HTML structure. Only fill in the placeholder content. This template is the approved design.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{EMAIL_SUBJECT}</title>
  <!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7; color: #2D3436; background: #f5f5f5; -webkit-text-size-adjust: 100%; }
    .email-wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .email-header { padding: 32px 32px 0; }
    .hero-img { width: 100%; max-height: 300px; object-fit: cover; border-radius: 8px; }
    .email-body { padding: 32px; }
    h1 { font-family: 'Inter', Arial, sans-serif; font-weight: 800; font-size: 28px; line-height: 1.2; color: #1a1a1a; margin-bottom: 16px; }
    h2 { font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 20px; line-height: 1.3; color: #F4A261; margin-top: 24px; margin-bottom: 12px; }
    p { margin-bottom: 16px; font-size: 16px; line-height: 1.7; color: #2D3436; }
    a { color: #E76F8B; text-decoration: underline; }
    .callout { background: #FFF3E0; padding: 20px; border-left: 4px solid #F4A261; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .callout h2 { color: #F4A261; margin-top: 0; font-size: 18px; }
    .callout ul { list-style: none; padding: 0; margin: 12px 0 0 0; }
    .callout li { padding: 6px 0 6px 24px; position: relative; font-size: 15px; line-height: 1.6; color: #2D3436; }
    .callout li:before { content: "\25B8"; position: absolute; left: 0; color: #E76F8B; font-size: 16px; }
    .read-more-btn { display: block; width: fit-content; margin: 24px auto; padding: 14px 36px; background: linear-gradient(135deg, #F4A261 0%, #E76F8B 100%); color: #ffffff !important; text-decoration: none; border-radius: 10px; font-family: 'Inter', Arial, sans-serif; font-weight: 600; font-size: 15px; text-align: center; }
    .divider { border: none; height: 3px; background: linear-gradient(135deg, #F4A261 0%, #E76F8B 100%); margin: 28px 0; border-radius: 2px; }
    .cta-section { background: linear-gradient(135deg, #2D3436 0%, #404854 100%); border-radius: 12px; padding: 36px 28px; text-align: center; color: #ffffff; margin-top: 32px; }
    .cta-section h3 { font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 22px; color: #F4A261; margin-bottom: 12px; }
    .cta-section p { color: rgba(255,255,255,0.85); font-size: 14px; margin-bottom: 16px; }
    .cta-buttons { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
    .cta-btn { display: inline-flex; align-items: center; gap: 6px; padding: 12px 24px; border-radius: 8px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px; text-decoration: none; transition: transform 0.2s; }
    .cta-btn:hover { transform: translateY(-2px); }
    .cta-primary { background: linear-gradient(135deg, #F4A261 0%, #E76F8B 100%); color: #ffffff !important; }
    .cta-secondary { background: rgba(255,255,255,0.12); color: #ffffff !important; border: 1.5px solid rgba(255,255,255,0.3); }
    .tagline { font-size: 14px; color: #E76F8B; margin-top: 12px; font-weight: 600; }
    .email-footer { padding: 24px 32px; text-align: center; font-size: 12px; color: #999; background: #fafafa; }
    .email-footer a { color: #999; }
    @media (max-width: 600px) {
      .email-body { padding: 20px 16px; }
      h1 { font-size: 22px; }
      h2 { font-size: 18px; }
      .cta-section { padding: 24px 16px; }
      .read-more-btn { padding: 12px 28px; font-size: 14px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">

    <!-- HERO IMAGE — full-width inside wrapper -->
    <div class="email-header">
      <img src="{HERO_IMAGE_URL}" alt="{ALT_TEXT_WITH_KEYWORD}" class="hero-img">
    </div>

    <div class="email-body">

      <!-- HEADLINE — Use the ACTUAL blog title or email topic, NOT "New Blog Post" -->
      <h1>{ACTUAL_BLOG_TITLE_OR_EMAIL_HEADLINE}</h1>

      <!-- OPENING HOOK — 1-2 conversational sentences about the topic -->
      <p>{OPENING_HOOK_1_2_SENTENCES}</p>

      <!-- CALLOUT BOX — "Inside the post" for blog announcements, or "What you'll learn" for newsletters -->
      <div class="callout">
        <h2>{CALLOUT_HEADING}</h2>
        <ul>
          <li>{TAKEAWAY_1}</li>
          <li>{TAKEAWAY_2}</li>
          <li>{TAKEAWAY_3}</li>
        </ul>
      </div>

      <!-- OPTIONAL: 1 short paragraph of additional context -->
      <p>{OPTIONAL_EXTRA_PARAGRAPH}</p>

      <!-- PRIMARY CTA BUTTON — centered, gradient -->
      <!-- For blog announcements: "Read the Full Post" -->
      <!-- For newsletters: "Read More" -->
      <!-- For promos: "Get Started" / "Claim Your Offer" -->
      <a href="{BLOG_URL_OR_CTA_LINK}" class="read-more-btn">{CTA_BUTTON_TEXT}</a>

      <!-- GRADIENT DIVIDER -->
      <hr class="divider">

      <!-- BLOOMIE STAFFING CTA — MANDATORY ON EVERY EMAIL, DARK CARD -->
      <div class="cta-section">
        <h3>{CTA_HEADLINE_CONNECTED_TO_EMAIL_TOPIC}</h3>
        <p>{CTA_BODY_1_2_SENTENCES}</p>
        <div class="cta-buttons">
          <a href="tel:+18005551234" class="cta-btn cta-primary">Call Us Now</a>
          <a href="https://bloomie.ai/demo" class="cta-btn cta-secondary">Schedule a Demo</a>
          <a href="sms:+18005551234" class="cta-btn cta-secondary">Text Your Questions</a>
        </div>
        <p class="tagline">Hire an AI Employee. Get Work Done.</p>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="email-footer">
      <p>You're receiving this because you subscribed to our updates.</p>
      <p><a href="{UNSUBSCRIBE_URL}">Unsubscribe</a> | <a href="{PREFERENCES_URL}">Update Preferences</a></p>
    </div>
  </div>
</body>
</html>
```

## TEMPLATE RULES — NON-NEGOTIABLE

1. **Email wrapper is 600px max-width centered** — standard email layout. NOT full-width like the blog.
2. **Hero image is inside the header** — with 8px border-radius, full-width inside the wrapper.
3. **Headline is the ACTUAL blog title or email topic** — NEVER use generic "New Blog Post" or "Weekly Update."
4. **Callout box uses warm peach background** (`#FFF3E0`) with orange left border (`#F4A261`) and orange triangle markers.
5. **H2 headings are orange** (`#F4A261`) — matching the blog template style.
6. **Primary CTA button is centered** — gradient orange-to-pink, not left-aligned.
7. **Gradient divider** separates email content from the Bloomie CTA section — NOT a 1px gray line.
8. **CTA section is dark slate card** with gradient button + 3 action buttons: Call, Demo, Text.
9. **Tagline "Hire an AI Employee. Get Work Done."** appears below the CTA buttons.
10. **Body text color is `#2D3436`** — dark charcoal, matching the blog.
11. **Do NOT change the colors, fonts, spacing, or layout.** Only fill in the content placeholders.

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
- Example: Subject: "3 mistakes killing your enrollment" | Preview: "Number 2 surprised even us."

## SOFT-SELL CTA RULES — EVERY EMAIL

Every email MUST end with a Bloomie Staffing CTA section. This is NOT optional.

Connect the CTA headline to the email topic:
- If about time management → "What If You Had a Team Member Who Never Sleeps?"
- If about marketing → "What If Your Marketing Ran Itself?"
- If about hiring → "What If Hiring Cost 80% Less?"
- If about customer service → "What If Every Customer Got a Reply in Under 60 Seconds?"
- If about AI/automation → "Ready to Transform Your Operations?"

Always three buttons: Call Us Now (primary), Schedule a Demo (secondary), Text Your Questions (secondary).

## CALLOUT BOX HEADINGS BY EMAIL TYPE

- **Blog Announcement**: "Inside the post:" followed by 3 key takeaways from the blog
- **Newsletter**: "This week:" followed by 3-5 topics covered
- **Promotional**: "What you get:" followed by 3 benefits/features
- **Welcome**: "Here's what to expect:" followed by 3 things they'll receive
- **Re-engagement**: "What you've missed:" followed by 3 recent highlights

## EMAIL TYPES

### Blog Announcement Email
Used when a new blog post is published. This is the most common email type for daily automation.
- Subject should tease the blog topic, NOT just say "New blog post"
- Headline = the ACTUAL blog post title (NOT "New Blog Post")
- Open with a 1-2 sentence hook related to the blog topic
- Callout box: "Inside the post:" with 3 key takeaways
- "Read the Full Post" button linking to the blog URL
- Bloomie CTA section at the bottom
- **Word count**: 100-200 words (quick read, drive to blog)

### Newsletter
- Headline = themed title (e.g., "Your Weekly Business Intel")
- Consistent format readers recognize
- Callout box: "This week:" with 3-5 items
- Feature one main piece of content with link
- Bloomie CTA section
- **Word count**: 200-350 words

### Promotional/Sales
- Headline = benefit-driven (NOT product name)
- Lead with the problem, not the product
- Callout box: "What you get:" with key benefits
- Clear offer CTA with urgency
- Bloomie CTA section
- **Word count**: 150-250 words

### Welcome Email
- Headline = warm welcome (e.g., "Welcome to the Team!")
- Set expectations for what they'll receive
- Callout box: "Here's what to expect:" with 3 things
- Soft CTA: explore content or reply
- Bloomie CTA section
- **Word count**: 150-200 words

## COPY STYLE

- **Conversational first person** — "I wanted to share..." not "We are pleased to announce..."
- **Write like you talk** — read it aloud. If it sounds stiff, rewrite.
- **Benefits over features** — "Save 3 hours every week" not "Automated scheduling tool"
- **Specific numbers** — "47 businesses enrolled last month" not "many businesses"
- **Short paragraphs**: 1-3 sentences max. White space between.
- **One clear CTA** — button style, action verb (above the Bloomie CTA section)
- **P.S. line** — 2nd most-read part of any email. Use for urgency or personal touch.

## COMBINED BLOG + EMAIL TASK

When asked to create a blog AND an announcement email in one request:
1. Create the blog FIRST using blog-content skill
2. Get the blog URL/title from the result
3. THEN create ONE email (using this skill) that references the blog
4. The email headline MUST be the exact blog title
5. Do NOT create two blogs or two emails. ONE of each. Total output = 1 blog + 1 email.

## DAILY BLOG + EMAIL AUTOMATION

When running on autopilot (daily blog + email task):
1. First create the blog post (using blog-content skill)
2. Wait for blog URL/ID
3. Create a blog announcement email promoting the new post
4. Email headline = exact blog title
5. Save email as CRM draft
6. Notify user: "New blog post and announcement email are ready for review"
7. On approval: send email to the subscriber list

## WHAT TO NEVER DO

- Use "New Blog Post" or generic text as the email headline — use the ACTUAL title
- Send without a subject line strategy
- Use "Dear Sir/Madam" or overly formal greetings
- Write promotional emails longer than 300 words
- Bury the CTA below the fold
- Use multiple competing CTAs (aside from the Bloomie CTA section at bottom)
- Use deceptive subject lines
- Forget mobile optimization
- Skip the Bloomie CTA section
- Skip the hero image
- Skip the callout box
- Send without user approval (always draft first)
- Use emojis in the email content
- Save only as a file without trying ghl_create_email_template first
- Modify the template CSS or layout
- Publish without user approval (always draft first)
