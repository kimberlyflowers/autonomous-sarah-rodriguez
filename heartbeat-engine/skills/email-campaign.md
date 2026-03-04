# Skill: Email Campaign Writing

## When to use
User asks you to write an email, email sequence, drip campaign, newsletter, or email copy.

## Email Anatomy
1. **Subject Line** — 6-10 words, creates curiosity or urgency. Test: would YOU open this?
2. **Preview Text** — first 40-90 chars that show in inbox. Complement the subject, don't repeat it
3. **Opening Line** — personal, direct, no "I hope this finds you well"
4. **Body** — one main idea per email, 150-250 words max
5. **CTA** — one clear action, make it a button-style link or bold text
6. **P.S.** — optional but powerful for re-stating the CTA or adding urgency

## Subject Line Formulas That Work
- Question: "Are you making this mistake with [topic]?"
- Number: "3 things every [audience] needs to know about [topic]"
- Urgency: "Last chance: [offer] ends [day]"
- Story: "How [person] went from [bad] to [good]"
- Direct: "[First name], your [thing] is ready"

## Rules
- Write like a human texting a friend, not a corporation
- One idea per email — if you have 3 points, write 3 emails
- Short paragraphs (1-2 sentences)
- Use the reader's first name via merge tag: {{contact.first_name}}
- NEVER use: "Dear valued customer", "I hope this email finds you", "As per our"
- Every email must have exactly ONE clear CTA
- For sequences: each email should stand alone (reader might skip one)

## Merge Tags (GHL)
- {{contact.first_name}} — first name
- {{contact.email}} — email
- {{contact.phone}} — phone
- {{location.name}} — business name
- {{location.phone}} — business phone

## Sequence Pacing
- Welcome: immediately after opt-in
- Nurture: every 2-3 days
- Sales: daily during launch week, then back off
- Re-engagement: 30, 60, 90 days after last interaction

## Output
Save as artifact: "email-[campaign-name].html" for single emails, "email-sequence-[name].md" for sequences.
When sending via GHL, use ghl_send_message with type "Email".
