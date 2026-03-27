---
name: book-writing
description: "Write book chapters, outlines, manuscripts, and long-form book content. Use this skill whenever the task involves writing a book, book chapter, book outline, manuscript, memoir, devotional, study guide, curriculum, course material, or any long-form book-length content. Also triggers for 'book', 'chapter', 'manuscript', 'outline', 'memoir', 'devotional', 'write my book', 'book idea', 'ghostwrite', or any request about creating book-length content. This skill helps authors go from idea to finished manuscript — whether it's a business book, memoir, devotional, children's book, or educational text. Every chapter should read like a published author wrote it."
---

# Book Writing — Published-Quality Manuscripts

Your Bloomie helps authors turn ideas into finished books. Whether it's a business book, memoir, faith-based devotional, children's book, or educational text — the output should read like a traditionally published work, not a first draft.

## MANDATORY PRE-BUILD GATE — NO EXCEPTIONS

**You MUST collect all required information via bloom_clarify BEFORE writing any chapters or outlines. This is a hard rule with zero exceptions.**

### The 6 things you MUST know before writing:
1. **Book type** — What kind of book? (business, memoir, devotional, children's, fiction, educational)
2. **Core message** — What's the ONE thing readers should take away?
3. **Target reader** — Who is this for? What problem do they have?
4. **Starting point** — Starting from scratch, have an outline, or continuing existing chapters?
5. **Author's voice** — How should it read? (conversational, academic, inspirational, storytelling)
6. **Scope** — Full book, single chapter, outline only, or specific section?

### Discovery Flow — call bloom_clarify for each missing piece (one at a time):

**Question 1 — What kind of book?**
Options: "Business / self-help", "Memoir / personal story", "Faith-based / devotional", "Children's book", "Educational / course material", "Fiction / creative", "Other (I'll describe)"
Context: "What type of book are you writing? This determines the structure, length, and tone."

**Question 2 — What's the core message?**
Options: "I have a clear message (I'll describe)", "I have a topic but need help focusing it", "I have scattered ideas — help me find the thread", "I'm not sure yet — help me figure it out"
Context: "If you could summarize this book in one sentence, what would it be? This becomes the backbone of everything we write."

**Question 3 — Who is the reader?**
Options: "Business owners / entrepreneurs", "Parents / families", "Faith community / church", "Students / learners", "General audience", "Other (I'll describe)"

**Question 4 — Where are you starting from?**
Options: "Starting from scratch — no outline yet", "I have an outline or table of contents", "I've started writing — need help continuing", "I have a draft that needs rewriting/editing", "I just need one chapter or section"

**Question 5 — Voice & details (FREE TEXT — do not use buttons):**
Ask: "How should this book sound? Describe the tone you want — conversational like talking to a friend, formal and academic, inspirational and uplifting, raw and honest? Also, any specific stories, experiences, or expertise that should anchor the content?"

### SKIP LOGIC:
- If the user specified book type in their request → skip Question 1
- If they shared a clear message or outline → skip Question 2
- Combine questions if the user is giving long, detailed answers
- NEVER ask more than one bloom_clarify at a time

### HARD STOP: Do NOT write any content until at least Questions 1, 2, 3, and 4 are answered.

---

## The Book Creation Process

### Phase 1: Concept Development (if starting from scratch)
When a user says "I want to write a book about X," guide them through:

1. **Core message**: What's the ONE thing readers should take away? Summarize in one sentence.
2. **Target reader**: Who picks this up? What problem do they have? What transformation do they want?
3. **Book type**: Business/self-help? Memoir? Devotional? Educational? Fiction? Children's?
4. **Unique angle**: Why THIS book? What makes the author's perspective different?
5. **Working title**: Suggest 3-5 titles. Format: [Compelling Title]: [Clarifying Subtitle]
   Example: "Rooted: A Classical Approach to Raising Fearless Thinkers"

### Phase 2: Outline / Structure
Create a chapter-by-chapter outline before writing. Default structure by book type:

**Business / Self-Help Book (10-14 chapters)**:
- Ch 1: The Problem (establish pain point, tell a story)
- Ch 2-3: The Framework (your unique model/approach)
- Ch 4-9: Implementation (one concept per chapter, stories + action steps)
- Ch 10-11: Overcoming Obstacles (common objections, troubleshooting)
- Ch 12: Vision / Transformation (what life looks like after applying this)
- Each chapter: 3,000-5,000 words. Total: 40,000-60,000 words.

**Memoir / Story-Based**:
- Chronological or thematic structure
- Each chapter = one scene/episode with a turning point
- Sensory detail: what did it look, sound, smell, feel like?
- Inner dialogue: what were you thinking/feeling?
- Universal truth extracted from personal experience
- Each chapter: 2,500-4,000 words. Total: 50,000-80,000 words.

**Devotional / Faith-Based (30-90 entries)**:
- Each entry: Scripture → Reflection → Application → Prayer
- 300-800 words per devotion
- Personal stories that illuminate the scripture
- Practical takeaway the reader can apply TODAY
- Conversational, warm tone — like a trusted pastor/friend
- Total: 15,000-40,000 words.

**Children's Book**:
- Age 0-3: 100-500 words, simple rhyme or repetition
- Age 4-7: 500-1,000 words, clear narrative arc, one lesson
- Age 8-12: 5,000-20,000 words, chapter books, character development
- Language appropriate to age. Read aloud test: does it flow?

**Educational / Curriculum**:
- Learning objectives stated at chapter start
- Content organized by concept progression (simple → complex)
- Practice exercises / discussion questions per chapter
- Key term definitions
- Chapter summaries

### Phase 3: Writing Chapters

#### Chapter Structure (encoded default)
Every chapter should follow this rhythm:
1. **Opening hook** (1-2 paragraphs): Story, surprising fact, or bold statement. NEVER "In this chapter, we will discuss..."
2. **Core content** (the teaching): Break into 3-5 sub-sections with clear headers
3. **Stories/examples**: At least 2 per chapter. Specific, sensory, emotional.
4. **Practical application**: What should the reader DO with this information?
5. **Transition**: Last paragraph bridges to the next chapter. Create anticipation.

#### Writing Style Defaults
- **Voice**: Match the author's natural speaking style. If the author speaks warmly and uses analogies, write that way. If they're direct and data-driven, match that.
- **Show, don't tell**: "Her hands trembled as she opened the letter" not "She was nervous"
- **Varied sentence length**: Mix short punchy sentences with longer flowing ones. Short sentences create impact. Longer sentences carry the reader through complex ideas with rhythm and depth.
- **Paragraph length**: 2-5 sentences. Vary intentionally. Single-sentence paragraphs for emphasis.
- **Active voice**: Default. Passive only for deliberate effect.
- **Dialogue**: Use when telling stories. Direct quotes are 3x more engaging than summary.
- **Specificity**: "A Tuesday morning in March" not "one day." "The worn leather Bible on his desk" not "his Bible."

#### Per-Chapter Checklist
- [ ] Opens with a hook (not a summary of what the chapter covers)
- [ ] Contains at least 2 stories/examples with sensory detail
- [ ] Has clear sub-sections with headers
- [ ] Includes actionable takeaway
- [ ] Ends with a transition to the next chapter
- [ ] Reads aloud naturally (no awkward phrasing)
- [ ] Word count is appropriate for book type

### Phase 4: Supporting Material
Offer to create these alongside the manuscript:
- **Book proposal** (for publishers): Overview, market analysis, comp titles, chapter summaries, sample chapters, author bio
- **Back cover copy**: Hook line, 3-4 sentences of promise, author bio, endorsement placeholder
- **Chapter discussion questions** (for study groups / book clubs)
- **Marketing one-pager**: For the author to share with potential publishers, agents, or audiences

### Delivery
- Save each chapter as a separate `.md` artifact: `ch01-the-beginning.md`
- Save the full outline as `book-outline.md`
- Include word count at the top of each chapter
- Flag sections that need author input: `[AUTHOR: Insert your personal story about...]`
- For devotionals, organize by day: `day-01.md`, `day-02.md`, etc.

### NEVER do these
- Start chapters with "In this chapter we will explore..."
- Write without understanding the author's voice (ask for a sample of how they talk/write)
- Use generic examples when the author has real stories to tell
- Produce thin chapters under 2,000 words for adult non-fiction
- Skip the outline phase and jump straight to writing
- Write in a voice that doesn't match the author
- Use clichés: "at the end of the day", "it is what it is", "needless to say"
- Forget to create anticipation between chapters

### Brand Kit Integration
- If a Brand Kit is in the system prompt, match the Brand Kit voice/tone for the author's writing style
- Use Brand Kit colors for any formatted chapter documents or book proposals
- Incorporate the brand tagline into back cover copy if relevant
- If no Brand Kit is available, ask the author about their preferred voice/tone
