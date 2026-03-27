---
name: social-media
description: "Create scroll-stopping social media content, captions, content calendars, and platform-specific posts. Use this skill whenever the task involves creating social media posts, captions, hashtags, content calendars, social strategy, carousel content, stories, reels scripts, or any social media content. Also triggers for Instagram, LinkedIn, Facebook, TikTok, Twitter/X, YouTube, and any request mentioning 'social', 'post', 'caption', 'hashtag', 'content calendar', 'carousel', or 'engagement'. Every post should stop the scroll — not blend into the feed. Posts with images get 2.3x more engagement."
---

# Social Media Content — Scroll-Stopping Posts

Every post should make someone stop scrolling. The standard: would this post get saved, shared, or commented on — not just liked?

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE writing any social content. This is a hard rule with zero exceptions.**

### The 5 things you MUST know before creating:
1. **Platform** — Which platform(s) is this for?
2. **Content type** — What format? (single post, carousel, reel/video script, story, content calendar)
3. **Topic or message** — What is the post about? What's the key takeaway?
4. **Goal** — What should this post do? (drive engagement, generate leads, build authority, promote something)
5. **Brand voice** — How should it sound? (professional, fun/casual, bold, inspirational)

### Discovery Flow — call bloom_clarify for each missing piece (one at a time):

**Question 1 — Which platform?**
Options: "Instagram", "LinkedIn", "Facebook", "TikTok", "Twitter/X", "Multiple platforms (I'll specify)"
Context: "Which platform is this for? Each one has different optimal formats, lengths, and strategies."

**Question 2 — What type of content?**
Options: "Single post with caption", "Carousel (multi-slide)", "Reel or video script", "Content calendar (multiple posts)", "Story or stories series"

**Question 3 — What's the post about?**
Options: "Promote a product or service", "Share a tip or teach something", "Tell a story or share a win", "Announce an event or news", "Other (I'll describe)"
Context: "What's the main message or topic? This helps me craft the right hook and structure."

**Question 4 — Key details (FREE TEXT — do not use buttons):**
Ask: "Give me the specifics — product name, event date, tip you want to share, story details, or any key facts. Also, do you want me to include hashtags and a call to action?"

### SKIP LOGIC:
- If the user named the platform → skip Question 1
- If the content type is clear from their request → skip Question 2
- If the topic is obvious → skip Question 3
- NEVER ask more than one bloom_clarify at a time

### HARD STOP: Do NOT write content until at least Questions 1, 3, and 4 are answered.

---

## Encoded Preferences (data-backed defaults)

### Platform-Specific Lengths (optimal for engagement)
- **Instagram**: 138-150 chars for feed posts (first line is the hook). Up to 2,200 for long-form.
- **LinkedIn**: 1,300-2,000 chars for thought leadership. First 3 lines must hook (before "see more").
- **Twitter/X**: 71-100 chars = highest engagement. Thread for longer content.
- **Facebook**: 40-80 chars for maximum engagement. Questions outperform statements.
- **TikTok captions**: Under 150 chars. Hook in first 3 words.

### The Hook (first line decides everything)
- First line must create curiosity, shock, or identification
- **Patterns that work**:
  - Contrarian: "Stop posting motivational quotes. Here's why."
  - Number: "I spent $50,000 on ads before learning this one thing."
  - Question: "What if everything you know about [topic] is wrong?"
  - Story: "Last Tuesday, a parent walked into our school and said..."
  - List tease: "3 things every [audience] needs to hear right now:"
- **NEVER start with**: Generic greetings, hashtags, or brand mentions

### Content Frameworks
**The Value Post** (educate/help):
Hook → 3-5 actionable tips → CTA to save/share
"Save this for later 🔖"

**The Story Post** (connect/relate):
Situation → Conflict → Resolution → Lesson → Question
"Has this ever happened to you?"

**The Authority Post** (position as expert):
Bold claim → Supporting evidence → Unique perspective → CTA
"Here's what nobody in [industry] is talking about..."

**The Engagement Post** (drive comments):
Question or poll → Options → "Drop your answer below 👇"
Questions get 2x more comments than statements.

**The Carousel** (Instagram/LinkedIn — 3x engagement of single images):
Slide 1: Bold hook headline (large text, contrasting background)
Slides 2-7: One point per slide, visual + short text
Final slide: Summary + CTA ("Follow for more" / "Save this")

### Hashtag Strategy
- **Instagram**: 5-10 hashtags. Mix of: 2 broad (500K+ posts), 3 medium (50K-500K), 3 niche (<50K)
- **LinkedIn**: 3-5 hashtags max. Industry-specific only.
- **Twitter/X**: 1-2 hashtags. More = lower engagement.
- **TikTok**: 3-5 trending + niche hashtags
- **Never**: #followforfollow, #like4like, or spam hashtags

### Visual Preferences
- Generate images with `image_generate` — custom > stock every time
- **Carousel text slides**: Bold sans-serif font, high contrast, brand colors, minimal text per slide
- **Quote graphics**: Large quotation marks, attributed, brand-colored background
- **Behind-the-scenes**: Authentic > polished for Stories/Reels
- **Video hooks**: First 3 seconds determine if someone watches. Text overlay + movement.

### Content Calendar (when asked to plan)
- **Minimum 3 posts/week** per platform for growth
- **Content mix**: 40% value/educational, 30% engagement/community, 20% promotional, 10% personal/behind-scenes
- **Never post the same content across platforms** — adapt format and length for each
- **Best posting times** (general): Instagram 11am-1pm, LinkedIn 8-10am (Tue-Thu), Twitter 9am-12pm, TikTok 7-9pm

### Delivery
- Save individual posts as `.md` with platform label, caption, hashtags, and image prompt
- Save content calendars as `.md` table: Date | Platform | Content Type | Caption | Visual | Hashtags
- Generate images for the first 3-5 posts to show the visual direction

### NEVER do these
- Write the same caption for all platforms
- Start with hashtags
- Use more than 2 emojis per sentence
- Post without a visual (text-only posts get buried)
- Ask people to "like and share" (algorithms punish this)
- Use corporate/formal language on social (it's social, be human)
- Forget the CTA (even "What do you think?" counts)

### Brand Kit Integration
- If a Brand Kit is in the system prompt, use those colors for any generated graphics or carousel slides
- Match the Brand Kit voice/tone in all captions and copy
- Use Brand Kit tagline when appropriate (e.g. in carousel final slides)
- When generating images with image_generate, reference brand colors in the prompt
- If no Brand Kit is available, use the social media defaults above
