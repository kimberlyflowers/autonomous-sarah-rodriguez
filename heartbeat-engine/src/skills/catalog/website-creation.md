---
name: website-creation
description: Build professional, conversion-optimized websites and landing pages that look like they cost $5,000+. Use this skill for ANY website request including landing pages, marketing sites, event pages, conference sites, portfolio sites, business sites, sales pages, or any web presence. Triggers on keywords like website, landing page, web page, site, homepage, online presence, web design, event site, conference, or when user needs a professional web interface. CRITICAL: EVERY website must be mobile responsive - NO EXCEPTIONS EVER.
---

# Professional Website Creation

**MISSION:** Build conversion-focused, mobile-first websites that generate real images, follow 2026 design trends, and convert visitors to action.

---

## CRITICAL RULES (NON-NEGOTIABLE)

### Rule #0: EDITING VS NEW CREATION
**When the user asks to MODIFY an existing website, DO NOT create a new one from scratch.**

**Signs the user wants to EDIT:**
- "Change the hero image to..."
- "Make the text bigger"
- "Update the contact form"
- "Fix the mobile layout"
- "Add a new section about..."
- "Remove the footer"
- "Change the colors to..."

**What to do:**
1. Ask user to provide the current HTML file OR share the file link
2. Read the existing HTML
3. Make ONLY the requested changes
4. Preserve everything else
5. Return the modified HTML

**What NOT to do:**
- Don't regenerate the entire website
- Don't change things the user didn't ask to change
- Don't lose existing content/images/styling

**Signs the user wants a NEW website:**
- "Create a website for..."
- "Build me a landing page..."
- "Make a site for my business"
- No mention of existing website

### Rule #1: MOBILE RESPONSIVE - ZERO TOLERANCE
**EVERY SINGLE WEBSITE MUST BE MOBILE RESPONSIVE. NO EXCEPTIONS. NONE. ZERO.**

If a website is not mobile responsive, it is BROKEN and UNACCEPTABLE.

**Required mobile specs:**
- `<meta name="viewport" content="width=device-width,initial-scale=1">` in `<head>`
- Works perfectly at 375px width (iPhone SE)
- Breakpoint at 768px: multi-column layouts → single column
- Touch targets minimum 44px × 44px
- No horizontal scroll at any width
- Text readable without zooming
- Images scale proportionally

**Test mentally:** "If someone opens this on their phone during a commute, does it work perfectly?" If no → FAIL.

### Rule #2: GENERATE REAL IMAGES
**ALWAYS use `image_generate` tool for hero images and key visuals.**

Before writing ANY HTML, generate images for:
- Hero sections (large background/foreground images)
- Feature showcases
- About section photos
- Testimonial backgrounds

Return format: `image_url` paths like `/api/files/preview/art_xxxxx` or `https://supabase.co/...`

### Rule #3: FULL-WIDTH HERO IMAGES
**Hero images MUST span edge-to-edge across viewport.**

CSS patterns:
```css
.hero {
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  position: relative;
}
```

OR use container with no side padding:
```css
.hero-container {
  width: 100%;
  max-width: 100%;
  padding: 0;
}
```

### Rule #4: THE 3-SECOND TEST
Visitor decides in 3 seconds whether to stay or bounce.

Must be instantly clear:
1. What is this? (value proposition)
2. Who is it for? (target audience)
3. What action to take? (single CTA)

---

## DESIGN FRAMEWORK

### Visual Hierarchy (Order of Importance)

1. **Hero Headline** - Largest, boldest (clamp(2.5rem, 5vw, 4.5rem))
2. **Hero CTA** - Prominent button, sticky in nav
3. **Hero Image** - Full-width, immersive
4. **Supporting Sections** - Scannable content
5. **Social Proof** - Near CTA
6. **Footer** - Contact/links

### Typography Rules (STRICT)

**Maximum 2-3 fonts:**
- Display/Heading font (bold, distinctive)
- Body font (clean, readable)
- Optional: Mono for code

**Never use:** Arial, Helvetica, Times New Roman, system defaults

**Always use:** Google Fonts via CDN
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Font+Name:wght@400;700&display=swap" rel="stylesheet">
```

**Size hierarchy:**
- H1 (Hero): clamp(2.5rem, 5vw, 4.5rem)
- H2: clamp(1.8rem, 3vw, 2.5rem)
- H3: clamp(1.3rem, 2vw, 1.8rem)
- Body: clamp(1rem, 1.5vw, 1.15rem)
- Small: 0.875rem

**Contrast:** WCAG AA minimum (4.5:1 for body, 3:1 for headings)

### Color Strategy

**Choose palette based on industry:**

**Tech/SaaS:** Bold modern (blues, purples, neon accents)
**Corporate/Finance:** Professional (navy, forest, gray + orange)
**Creative/Agency:** Experimental (break rules, asymmetric)
**E-commerce:** Product-forward (match product aesthetic)
**Non-profit/Education:** Warm, hopeful (earth tones, deep blues)
**Local Business:** Approachable (warm or clean professional)

**Pattern:**
- 1 dominant color (60%)
- 1 accent color (30%)
- 1 highlight for CTAs (10%)
- Use CSS variables for consistency

### Whitespace = Focus

**TED Conferences principle:** Let content breathe

- Generous padding between sections (clamp(3rem, 8vw, 6rem))
- Don't crowd content
- Balance density with space
- Asymmetric layouts create visual interest

---

## CONVERSION PRINCIPLES (Data-Backed)

### Single Primary CTA
- ONE action per page (register, buy, book, download)
- Sticky nav keeps CTA visible
- Repeated at logical points (hero, after social proof, footer)
- High contrast button (stands out)

### Social Proof Near CTA
- Testimonials within eyeshot of button
- "Join 10,000+ users"
- Star ratings, client logos
- 92% of consumers trust peer recommendations

### Reduce Form Friction
- Each field reduces conversions ~5%
- Ask ONLY essential info
- Use smart defaults
- Show progress if multi-step

### Speed Matters
- Inline CSS (no external stylesheet)
- Inline JavaScript (no external files)
- Lazy load images below fold
- No heavy frameworks (Bootstrap, jQuery)

---

## IMAGE GENERATION GUIDE

### When to Generate Images

**ALWAYS generate for:**
- Hero sections (primary visual)
- Feature showcases
- About/team sections
- Testimonial backgrounds
- Conference/event hero images

**Workflow:**
1. Call `image_generate` FIRST for each image needed
2. Tool returns `image_url` (e.g., `/api/files/preview/art_12345`)
3. Use URL in HTML: `<img src="/api/files/preview/art_12345" alt="...">`
4. THEN create the HTML artifact with all URLs embedded

### Image Prompting Best Practices

Use **6-element framework** (from Google Gemini docs):

1. **Subject** - Who/what (specific details)
2. **Composition** - Camera angle, framing, perspective
3. **Action** - What's happening
4. **Location** - Setting, environment, background
5. **Style** - Photography style, mood, aesthetic
6. **Technical** - Lighting, camera specs, quality

**Example prompt:**
```
Professional conference hero image for women's leadership summit.

SUBJECT: Diverse group of professional women in business attire standing confidently on a modern stage. Seven women of varying ethnicities, ages 30-50, wearing colorful blazers (blue, green, red, black). Arms crossed or hands on hips, exuding confidence and leadership.

COMPOSITION: Wide-angle shot, low angle looking up at the women to convey power and authority. Centered composition with stage lights creating dramatic atmosphere.

ACTION: Women standing in powerful poses, looking directly at camera. Stage presence, conference energy.

LOCATION: Modern conference stage with professional lighting. Subtle backdrop with geometric patterns or soft bokeh lights. Clean, corporate environment.

STYLE: Professional photography aesthetic, editorial quality. Empowering, aspirational mood. Modern 2026 conference visual style - authentic over perfection.

TECHNICAL: Shot with 35mm lens, dramatic stage lighting with rim lights creating edge highlights. Sharp focus on subjects, slight depth of field. Professional conference photography quality, vibrant colors.
```

**For photorealistic images:**
- Use camera language: "35mm lens", "shallow depth of field", "golden hour lighting"
- Specify lighting: "studio softbox", "natural window light", "dramatic rim lighting"
- Composition: "rule of thirds", "low-angle perspective", "bird's eye view"

**Aspect ratios for websites:**
- Hero images: 1536x1024 (landscape 3:2) - ALWAYS use landscape for heroes
- Feature images: 1024x1024 (square 1:1)
- Tall sections: 1024x1536 (portrait 2:3)

---

## WEBSITE STRUCTURE PATTERNS

### Conference/Event Sites

**Sections (in order):**
1. **Hero** - Event name, date, location, Register CTA, full-width hero image
2. **What to Expect** - 3-4 key benefits/features
3. **Speakers** - Grid of headshots + bios (if applicable)
4. **Schedule** - Filterable or tabbed by day
5. **Social Proof** - Past attendee testimonials, attendance numbers
6. **Registration** - Streamlined form (name, email, ticket type)
7. **Footer** - Contact, social, copyright

**Design priorities:**
- Bold headline (not overlaid on busy images)
- Clear date/location/time immediately visible
- Single Register CTA (sticky in nav)
- Avoid color chaos (pick 2-3 colors max)
- Generous whitespace between sections

### Business/Agency Sites

**Sections:**
1. **Hero** - Value prop + CTA + product/service visual
2. **Client Logos** - "Trusted by..."
3. **Services/Features** - Grid or bento layout
4. **Case Studies** - Before/after, specific results
5. **About/Team** - Build trust
6. **Final CTA** - "Get Started"
7. **Footer**

### E-commerce/Product Sites

**Sections:**
1. **Hero** - Hero product image/video + "Shop Now"
2. **Product Grid** - Lifestyle photography
3. **Social Proof** - Reviews, star ratings, UGC
4. **Benefits** - Why buy this?
5. **CTA** - "Add to Cart"

### Portfolio/Creator Sites

**Sections:**
1. **Hero** - Name/face + what you do
2. **Work Showcase** - Portfolio grid
3. **About Story** - Personal narrative
4. **Testimonials** - Client feedback
5. **Contact/Book** - Clear next step

---

## TECHNICAL STANDARDS

### HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Page Title]</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Font:wght@400;700&display=swap" rel="stylesheet">
  <style>
    /* ALL CSS INLINE HERE */
  </style>
</head>
<body>
  <nav class="nav"><!-- Sticky nav --></nav>
  <section class="hero"><!-- Full-width hero --></section>
  <section><!-- Content sections --></section>
  <footer><!-- Footer --></footer>
  
  <script>
    /* ALL JAVASCRIPT INLINE HERE */
  </script>
</body>
</html>
```

### CSS Essentials

**CSS Variables:**
```css
:root {
  --color-primary: #...;
  --color-accent: #...;
  --color-text: #...;
  --color-bg: #...;
  --font-heading: 'Font Name', sans-serif;
  --font-body: 'Font Name', sans-serif;
}
```

**Responsive Grid:**
```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
```

**Sticky Navigation:**
```css
.nav {
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 1000;
  transition: all 0.3s;
  padding: 1rem 0;
}

.nav.scrolled {
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(20px);
  box-shadow: 0 1px 20px rgba(0,0,0,0.05);
}
```

**Mobile Hamburger:**
```css
.hamburger {
  display: none;
}

@media (max-width: 768px) {
  .hamburger {
    display: block;
  }
  .nav-links {
    display: none;
  }
  .nav-links.active {
    display: flex;
    flex-direction: column;
  }
}
```

### Animations (Enhance, Don't Distract)

**Scroll-triggered fade-in:**
```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
```

**Hover effects:**
```css
.card {
  transition: transform 0.3s, box-shadow 0.3s;
}
.card:hover {
  transform: translateY(-6px);
  box-shadow: 0 10px 30px rgba(0,0,0,0.15);
}
```

---

## QUALITY CHECKLIST

Before delivering, verify:

**Mobile (NON-NEGOTIABLE):**
- [ ] Works at 375px width
- [ ] No horizontal scroll
- [ ] Touch targets 44px+
- [ ] Readable text (no zooming)
- [ ] Navigation accessible

**Performance:**
- [ ] Inline CSS
- [ ] Inline JavaScript
- [ ] Google Fonts via CDN
- [ ] Lazy load images
- [ ] No external dependencies

**Design:**
- [ ] 3-second test passes (clear value prop)
- [ ] Single primary CTA
- [ ] Full-width hero image
- [ ] 2-3 fonts maximum
- [ ] Consistent color palette
- [ ] Generous whitespace
- [ ] Contrast ratios meet WCAG AA

**Content:**
- [ ] Headlines bold and clear
- [ ] Social proof near CTA
- [ ] Real generated images (not placeholders)
- [ ] Alt text on all images
- [ ] No Lorem Ipsum

**Conversion:**
- [ ] Sticky nav with CTA
- [ ] Reduced form fields
- [ ] Clear next step
- [ ] Trust signals present

---

## COMMON MISTAKES TO AVOID

### ❌ Poor Contrast
White text on light backgrounds → unreadable
**FIX:** Dark overlay on hero images, high contrast

### ❌ Competing CTAs
Multiple "Sign Up" "Learn More" "Book Now" → confusion
**FIX:** ONE primary action per page

### ❌ Color Chaos
Pink + red + orange + purple = visual assault
**FIX:** Pick 2-3 colors maximum

### ❌ Generic Stock Photos
Looks like every other corporate site
**FIX:** Generate specific, contextual images

### ❌ Intimidating Forms
10 fields → abandonment
**FIX:** Ask ONLY essential info

### ❌ Inconsistent Spacing
Random gaps destroy flow
**FIX:** Use consistent padding units

### ❌ Missing Mobile Optimization
Works on desktop, breaks on phone → FAIL
**FIX:** Design mobile-first, enhance for desktop

---

## EXAMPLES OF GREAT PATTERNS

### Conference Hero (VueJS Conference style)
```html
<section class="hero">
  <img src="/api/files/preview/art_12345" alt="Conference" class="hero-bg">
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <h1>Conference Name</h1>
    <p class="hero-date">March 17, 2026 | San Antonio, TX</p>
    <a href="#register" class="btn-primary">Register Now</a>
  </div>
</section>
```

### Feature Grid (Bento Layout)
```html
<section class="features">
  <div class="bento-grid">
    <div class="bento-item large">
      <h3>Feature 1</h3>
      <p>Description</p>
    </div>
    <div class="bento-item">
      <h3>Feature 2</h3>
    </div>
    <div class="bento-item">
      <h3>Feature 3</h3>
    </div>
  </div>
</section>
```

### Social Proof Section
```html
<section class="social-proof">
  <h2>What People Say</h2>
  <div class="testimonial-grid">
    <div class="testimonial">
      <p class="quote">"This changed everything..."</p>
      <p class="author">— Jane Doe, CEO</p>
    </div>
    <!-- Repeat -->
  </div>
  <div class="stats">
    <div class="stat">
      <strong>10,000+</strong>
      <span>Happy Users</span>
    </div>
  </div>
</section>
```

---

## FINAL REMINDERS

1. **Mobile first** - If it doesn't work on mobile, it's broken
2. **Generate images** - Use `image_generate` for all key visuals
3. **Full-width heroes** - Edge-to-edge immersive
4. **3-second test** - Clear value prop immediately
5. **Single CTA** - ONE action per page
6. **Real content** - No Lorem Ipsum, no placeholders
7. **Save as `.html`** - Use `create_artifact` tool

The goal: A website that converts visitors to action, looks professional, and works flawlessly on every device.
 
