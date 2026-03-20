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
Write the full email following all the rules below. Format as styled HTML (not markdown) so it renders correctly in the CRM email builder and in inboxes.

### Step 3: Save as CRM Email Draft
Call `ghl_create_email_template` with:
- `name`: Descriptive internal name (e.g., "Blog Announcement - 5 Hiring Mistakes - Mar 2026")
- `subject`: Optimized subject line (6-10 words, front-load value)
- `previewText`: First 90 characters preview text that complements the subject
- `html`: Full HTML email content (with Inter font, hero image, CTA section)
- `imageUrl`: The hero image URL from Step 1
- `type`: One of: "newsletter", "promotional", "welcome", "re-engagement", "blog-announcement"
- `tags`: Relevant tags

### Step 4: Also Save as Artifact
Call `create_artifact` to save the email HTML as a file in the Files tab (backup + preview).

### Step 5: Notify the User
Send the user a message with:
- Email subject line
- A brief summary (1-2 sentences of what the email covers)
- The CRM email draft link for review
- "Ready for your review — once you approve, I'll send it to your list."

## EMAIL HTML TEMPLATE

Every email must follow this HTML structure:

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
    body { font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7; color: #333; background: #f5f5f5; -webkit-text-size-adjust: 100%; }
    .email-wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .email-header { padding: 32px 32px 0; }
    .hero-img { width: 100%; max-height: 300px; object-fit: cover; border-radius: 8px; }
    .email-body { padding: 32px; }
    h1 { font-family: 'Inter', Arial, sans-serif; font-weight: 800; font-size: 28px; line-height: 1.2; color: #1a1a1a; margin-bottom: 16px; }
    h2 { font-family: 'Inter', Arial, sans-serif; font-weight: 700; font-size: 22px; line-height: 1.3; color: #1a1a1a; margin-top: 28px; margin-bottom: 12px; }
    p { margin-bottom: 16px; font-size: 16px; }
    a { color: #E76F8B; text-decoration: underline; }
    .read-more-btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #F4A261, #E76F8B); color: #ffffff !important; text-decoration: none; border-radius: 10px; font-family: 'Inter', Arial, sans-serif; font-weight: 600; font-size: 15px; margin: 16px 0; }
    .divider { border: none; border-top: 1px solid #eee; margin: 28px 0; }
    .cta-section { background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 12px; padding: 36px 28px; text-align: center; color: #fff; margin-top: 32px; }
    .cta-section h2 { color: #fff; margin-top: 0; font-size: 22px; }
    .cta-section p { color: rgba(255,255,255,0.85); font-size: 14px; }
    .cta-buttons { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
    .cta-btn { display: inline-flex; align-items: center; gap: 6px; padding: 12px 24px; border-radius: 8px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px; text-decoration: none; }
    .cta-primary { background: linear-gradient(135deg, #F4A261, #E76F8B); color: #fff !important; }
    .cta-secondary { background: rgba(255,255,255,0.15); color: #fff !important; border: 1.5px solid rgba(255,255,255,0.3); }
    .email-footer { padding: 24px 32px; text-align: center; font-size: 12px; color: #999; background: #fafafa; }
    .email-footer a { color: #999; }
    @media (max-width: 600px) {
      .email-body { padding: 20px 16px; }
      h1 { font-size: 22px; }
      h2 { font-size: 18px; }
      .cta-section { padding: 24px 16px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-header">
      <img src="{HERO_IMAGE_URL}" alt="{ALT_TEXT}" class="hero-img">
    </div>

    <div class="email-body">
      <h1>{EMAIL_HEADLINE}</h1>

      <!-- EMAIL CONTENT HERE -->
      <!-- Keep paragraphs short: 1-3 sentences -->
      <!-- One email = one goal -->
      <!-- Above-the-fold CTA -->

      <!-- FOR BLOG ANNOUNCEMENTS: Link to blog post -->
      <a href="{BLOG_URL}" class="read-more-btn">Read the Full Post</a>

      <hr class="divider">

      <!-- BLOOMIE STAFFING CTA — MANDATORY ON EVERY EMAIL -->
      <div class="cta-section">
        <h2>What If Your Business Ran Itself?</h2>
        <p>Bloomie AI employees handle your marketing, content, customer service, and operations — so you can focus on what matters. Part-time or full-time, starting at a fraction of a traditional hire.</p>
        <div class="cta-buttons">
          <a href="tel:+1XXXXXXXXXX" class="cta-btn cta-primary">Call Us Now</a>
          <a href="https://bloomie.ai/demo" class="cta-btn cta-secondary">Schedule a Demo</a>
          <a href="sms:+1XXXXXXXXXX" class="cta-btn cta-secondary">Text Your Questions</a>
        </div>
      </div>
    </div>

    <div class="email-footer">
      <p>You're receiving this because you subscribed to our updates.</p>
      <p><a href="{UNSUBSCRIBE_URL}">Unsubscribe</a> | <a href="{PREFERENCES_URL}">Update Preferences</a></p>
    </div>
  </div>
</body>
</html>
```

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

Connect the email topic to Bloomie's value proposition:
- If about productivity → "What if you had a team member who never sleeps?"
- If about marketing → "What if your marketing ran itself?"
- If about hiring → "What if hiring cost 80% less?"
- If about customer service → "What if every customer got a reply in under 60 seconds?"

Three CTA options always present:
1. **Call** — "Call Us Now" (primary, gradient button)
2. **Schedule Demo** — "Schedule a Demo" (secondary)
3. **Text** — "Text Your Questions" (secondary)

## EMAIL TYPES

### Blog Announcement Email
Used when a new blog post is published. This is the most common email type for daily automation.
- Subject should tease the blog topic, not just say "New blog post"
- Open with a hook related to the blog topic (1-2 sentences)
- Give 2-3 key takeaways from the post
- "Read the Full Post" button linking to the blog URL
- Bloomie CTA at the bottom
- **Word count**: 150-250 words (quick read, drive to blog)

### Newsletter
- Consistent format readers recognize
- 3-5 value items with brief commentary
- Personal intro paragraph
- Feature one main piece of content
- End with personal note before Bloomie CTA

### Promotional/Sales
- Lead with the problem, not the product
- Agitate the pain: what happens if they don't act?
- Present solution with social proof
- Clear offer with deadline/scarcity (real, not fake)
- Risk reversal: guarantee, free trial, easy cancel
- P.S. with urgency reminder before Bloomie CTA

### Welcome Email
- Send immediately after signup
- Warm, personal tone
- Set expectations: what they'll receive, how often
- Quick win: link to best content or exclusive resource
- Soft CTA: "Hit reply and tell me..."

## COPY STYLE

- **Conversational first person** — "I wanted to share..." not "We are pleased to announce..."
- **Write like you talk** — read it aloud. If it sounds stiff, rewrite.
- **Benefits over features** — "Save 3 hours every week" not "Automated scheduling tool"
- **Specific numbers** — "47 businesses enrolled last month" not "many businesses"
- **Short paragraphs**: 1-3 sentences max. White space between.
- **One clear CTA** — button style, action verb
- **P.S. line** — 2nd most-read part of any email. Use for urgency or personal touch.

## DAILY BLOG + EMAIL AUTOMATION

When running on autopilot (daily blog + email task):
1. First create the blog post (using blog-content skill)
2. Wait for blog URL/ID
3. Create a blog announcement email promoting the new post
4. Save email as CRM draft
5. Notify user: "New blog post and announcement email are ready for review"
6. On approval: send email to the subscriber list

## WHAT TO NEVER DO

- Send without a subject line strategy
- Use "Dear Sir/Madam" or overly formal greetings
- Write promotional emails longer than 300 words
- Bury the CTA below the fold
- Use multiple competing CTAs (aside from the Bloomie CTA section at bottom)
- Use deceptive subject lines
- Forget mobile optimization
- Skip the Bloomie CTA section
- Skip the hero image
- Send without user approval (always draft first)
- Use emojis in the email content
- Save only as a file without creating the CRM draft
