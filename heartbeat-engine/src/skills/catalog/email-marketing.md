---
name: email-marketing
description: "Write email campaigns, sequences, subject lines, and SMS that feel human and actually convert. Use when the task involves email marketing, drip campaigns, newsletters, follow-up sequences, cold outreach, welcome sequences, re-engagement, or SMS messaging. Also use for A/B subject lines and email templates."
---

# Email Marketing

## How to Think About This

Every email lands next to messages from the reader's mom, their boss, and Amazon. Your email has to earn the right to exist there. The best marketing emails don't feel like marketing — they feel like a message from someone who understands you.

Check memory and Company Skills for brand voice, audience, sign-off style, and email guidelines before writing.

## The Subject Line Is a Promise

Only job: get the email opened. It promises something the body delivers.

What works: personal and specific, curiosity without clickbait, direct address with {firstName}.
What dies: "Newsletter #14", "Exciting news!", "Don't miss out!", ALL CAPS.

Always write 2 A/B variants. The winner teaches you about the audience.

## Email 1 Is NEVER About You

First email validates THEIR decision, not your product. They gave you their email — honor that trust.

Bad: "Welcome! Here's what we offer: [features]"
Good: "The fact that you're here means you're already a step ahead."

Trust first. Story second. Invitation third. This order matters.

## Story Beats Statistics

One specific person's experience → people forward it.
"95% satisfaction rate" → nobody feels anything.

Every nurture email needs at least one SPECIFIC detail a template could never produce.

## CTA Rules

- ONE CTA per email. One.
- "Reply [KEYWORD]" converts 3-5x better than link clicks (starts a CRM conversation)
- Put CTA after the emotional peak, not the very end
- P.S. line = second-most-read part. Use for warmth, not another CTA.

## Sequence Architecture

### Welcome (3-5 emails)
1. **Validation** (immediate) — Honor signup. No selling.
2. **Story** (Day 2) — Real person's experience.
3. **Invitation** (Day 5) — One clear ask. "Reply [KEYWORD]."
4. **Social proof** (Day 8) — Different angle.
5. **Gentle close** (Day 12) — "No pressure."

### Re-engagement: Acknowledge silence, offer value not guilt, single easy CTA.
### No response: Day 2 resend, Day 4 SMS, Day 10 value email, then stop.

## Technical: HTML Email Best Practices

### Structure
```html
<!-- Email skeleton — table-based for compatibility -->
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;">
  <tr><td style="padding:30px 20px;">
    <!-- Content here -->
  </td></tr>
</table>
```

### Critical Rules
- **Max width: 600px.** Every email client renders differently. 600px is the safe zone.
- **Table-based layout.** Flexbox and grid break in Outlook. Use nested tables.
- **Inline CSS only.** Most email clients strip `<style>` tags. Every style must be inline.
- **System fonts only.** Arial, Helvetica, Georgia, Times New Roman. Custom fonts fail in 40% of clients.
- **Images: always include alt text.** Many clients block images by default. Alt text = your fallback.
- **Button as table cell**, not `<button>` tag:
```html
<table cellpadding="0" cellspacing="0"><tr>
  <td style="background:#E76F8B;border-radius:8px;padding:14px 28px;">
    <a href="LINK" style="color:#ffffff;font-weight:bold;text-decoration:none;font-size:16px;">Book My Free Demo</a>
  </td>
</tr></table>
```
- **Preview text**: Use a hidden span after the subject to control the preview line:
```html
<span style="display:none;max-height:0;overflow:hidden;">Your preview text here</span>
```
- **Unsubscribe link**: Required by law. Always include at bottom.
- **Plain text version**: Always provide. Some clients only show plain text.

### Mobile Responsive
```html
<style>
@media screen and (max-width: 600px) {
  .content { width: 100% !important; padding: 15px !important; }
  .headline { font-size: 24px !important; }
}
</style>
```
Note: `@media` queries work in Apple Mail, Gmail app, but NOT Outlook. Design mobile-first at 600px to be safe everywhere.

### Testing Checklist
- Does it render in a single column under 600px?
- Does it look right with images blocked?
- Is the CTA visible without scrolling on mobile?
- Is the plain text version readable?
- Does the preview text show correctly?

## SMS Best Practices

- 160 characters max (1 segment). More = higher cost + split delivery.
- Lead with their name. Send 10am-7pm local only.
- Max 4/month. Include opt-out.

## Follow-Up Logic

Always define what happens AFTER:
- Reply with keyword → auto-tag, create deal, notify team
- Reply with question → personal answer within 2 hours
- No open → resend with new subject, then SMS
- Unsubscribe → respect completely, never re-add

## Output Format

Every email includes: subject + 2 A/B variants, preview text, full HTML body, plain text version, send time, follow-up logic, segment recommendation.

## Common Mistakes

- Pitching in email 1
- Multiple CTAs competing
- No story or specificity
- "Dear Valued Customer"
- Follow-ups that just say "Following up!"
- Not thinking about what happens AFTER
- Designing for desktop when 80%+ opens are mobile
- Using `<button>` tags (break in Outlook)
- Forgetting plain text version
