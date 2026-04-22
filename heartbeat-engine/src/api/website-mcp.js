// BLOOM Website MCP Server
// Lean 4-tool MCP used exclusively by the BLOOM Managed Website Agent.
// Provides: layout blueprints, interactive clarify buttons, task checklist, progress posts.
//
// Connector URL: https://your-railway-url.up.railway.app/website-mcp
// Used by: Managed Agent mcp_servers config (not for Cowork — entry point is the chat)

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('website-mcp');
const router = express.Router();

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// ── LAYOUT BLUEPRINTS ─────────────────────────────────────────────────────────
// 20 structurally distinct HTML skeletons — one per design style.
// Each has a genuinely different layout, not just different colors.

const LAYOUT_BLUEPRINTS = {

  'clean-precision': {
    hero: 'split-50-50',
    description: 'Left: headline + subhead + CTA. Right: full-bleed image. Clean nav with logo left, links right.',
    structure: ['nav-split', 'hero-split', 'trust-bar', 'features-alternating-rows', 'testimonials-3col', 'cta-band', 'contact-form-beside-info', 'footer'],
    skeleton: `
<nav style="display:flex;justify-content:space-between;align-items:center;padding:1rem 4rem;position:fixed;top:0;width:100%;z-index:100;background:#fff;box-shadow:0 1px 0 rgba(0,0,0,0.08)">
  <div class="logo">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none">{{NAV_LINKS}}</ul>
  <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
</nav>
<section style="display:grid;grid-template-columns:1fr 1fr;min-height:100vh;padding-top:80px">
  <div style="display:flex;flex-direction:column;justify-content:center;padding:4rem">
    <h1 style="font-size:clamp(2.5rem,4vw,3.5rem);line-height:1.1">{{HEADLINE}}</h1>
    <p style="font-size:1.2rem;margin:1.5rem 0;color:#666">{{SUBHEADLINE}}</p>
    <a href="#contact" class="btn-primary" style="align-self:flex-start">{{CTA_TEXT}}</a>
  </div>
  <div style="background:url('{{HERO_IMAGE_URL}}') center/cover no-repeat"></div>
</section>
<section class="trust-bar" style="padding:2rem 4rem;background:#f8f8f8;display:flex;gap:3rem;align-items:center;justify-content:center">{{TRUST_LOGOS_OR_STATS}}</section>
<section style="padding:6rem 4rem">{{ALTERNATING_FEATURE_ROWS}}</section>
<section style="padding:6rem 4rem;background:#f8f8f8">{{TESTIMONIALS_3COL}}</section>
<section style="padding:4rem;background:var(--color-primary);color:#fff;text-align:center">
  <h2>{{CTA_HEADLINE}}</h2>
  <a href="#contact" class="btn-accent" style="margin-top:1.5rem;display:inline-block">{{CTA_TEXT}}</a>
</section>
<section id="contact" style="padding:6rem 4rem;display:grid;grid-template-columns:1fr 1fr;gap:4rem">
  <div>{{CONTACT_INFO}}</div>
  <form id="contact-form">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:3rem 4rem;background:#111;color:#fff">{{FOOTER_CONTENT}}</footer>`
  },

  'bold-minimalism': {
    hero: 'typographic-only',
    description: 'Giant headline fills viewport — no hero image. Text IS the design. Maximum whitespace.',
    structure: ['nav-minimal', 'hero-typographic', 'feature-large-numbers', 'full-width-pullquote', 'gallery-2col', 'contact-centered', 'footer-single-line'],
    skeleton: `
<nav style="padding:2rem 6rem;display:flex;justify-content:space-between">
  <div class="logo">{{LOGO_OR_NAME}}</div>
  <a href="#contact" style="font-size:0.9rem;letter-spacing:0.1em;text-transform:uppercase">{{CTA_TEXT}} →</a>
</nav>
<section style="padding:8rem 6rem;min-height:80vh;display:flex;flex-direction:column;justify-content:center">
  <h1 style="font-size:clamp(4rem,10vw,9rem);line-height:0.95;letter-spacing:-0.03em;max-width:900px">{{HEADLINE}}</h1>
  <p style="font-size:1.1rem;max-width:480px;margin-top:3rem;color:#555">{{SUBHEADLINE}}</p>
</section>
<section style="padding:6rem 6rem">
  {{FEATURES_AS_NUMBERED_ITEMS_01_02_03}}
</section>
<section style="padding:6rem;background:#111;color:#fff">
  <blockquote style="font-size:clamp(1.8rem,3vw,2.8rem);font-style:italic;max-width:800px;margin:0 auto">"{{PULLQUOTE}}"</blockquote>
</section>
<section style="padding:6rem;display:grid;grid-template-columns:1fr 1fr;gap:2rem">
  <img src="{{IMAGE_1}}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover">
  <img src="{{IMAGE_2}}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;margin-top:4rem">
</section>
<section id="contact" style="padding:8rem 6rem;text-align:center">
  <h2 style="font-size:3rem">{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:480px;margin:3rem auto">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:2rem 6rem;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:0.85rem;color:#999">
  <span>© {{YEAR}} {{BUSINESS_NAME}}</span><span>{{FOOTER_LINKS}}</span>
</footer>`
  },

  'dark-luxe': {
    hero: 'full-bleed-cinematic',
    description: 'Full viewport image/video takeover with overlaid text. Dark, cinematic. Horizontal scroll feature showcase.',
    structure: ['nav-transparent-overlay', 'hero-fullscreen-cinematic', 'horizontal-scroll-features', 'floating-image-gallery', 'testimonial-single-large', 'contact-dark', 'footer-dark'],
    skeleton: `
<nav style="position:fixed;top:0;width:100%;z-index:100;padding:2rem 4rem;display:flex;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.6),transparent)">
  <div class="logo" style="color:#fff">{{LOGO_OR_NAME}}</div>
  <a href="#contact" class="btn-outline-light">{{CTA_TEXT}}</a>
</nav>
<section style="height:100vh;position:relative;overflow:hidden">
  <img src="{{HERO_IMAGE_URL}}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45)"></div>
  <div style="position:relative;z-index:2;height:100%;display:flex;flex-direction:column;justify-content:flex-end;padding:6rem">
    <h1 style="font-size:clamp(3rem,7vw,7rem);color:#fff;line-height:1;max-width:700px">{{HEADLINE}}</h1>
    <a href="#contact" class="btn-primary" style="margin-top:2rem;align-self:flex-start">{{CTA_TEXT}}</a>
  </div>
</section>
<section style="padding:6rem 0;overflow-x:auto">
  <div style="display:flex;gap:2rem;padding:0 4rem;width:max-content">{{HORIZONTAL_FEATURE_CARDS}}</div>
</section>
<section style="padding:6rem 4rem;display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
  {{FLOATING_IMAGE_GALLERY_3COL}}
</section>
<section style="padding:8rem 4rem;background:#0a0a0a;color:#fff;text-align:center">
  <p style="font-size:0.8rem;letter-spacing:0.2em;text-transform:uppercase;color:#888;margin-bottom:2rem">{{CLIENT_OR_AWARD}}</p>
  <blockquote style="font-size:clamp(1.5rem,3vw,2.5rem);font-style:italic;max-width:700px;margin:0 auto">"{{TESTIMONIAL}}"</blockquote>
  <p style="margin-top:2rem;color:#888">— {{TESTIMONIAL_AUTHOR}}</p>
</section>
<section id="contact" style="padding:6rem 4rem;background:#111;color:#fff">
  <h2 style="font-size:2.5rem;margin-bottom:3rem">{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:600px">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:3rem 4rem;background:#0a0a0a;color:#555;display:flex;justify-content:space-between">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'coral-energy': {
    hero: 'bento-grid-hero',
    description: 'Hero is a bento grid of stat cards + main visual. Tab-based feature sections. Dashboard energy.',
    structure: ['nav-standard', 'hero-bento-grid', 'features-tabbed', 'stats-band', 'testimonials-cards', 'contact-form', 'footer'],
    skeleton: `
<nav style="padding:1rem 3rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee">
  <div class="logo">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none">{{NAV_LINKS}}</ul>
  <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
</nav>
<section style="padding:4rem 3rem">
  <div style="display:grid;grid-template-columns:2fr 1fr 1fr;grid-template-rows:auto auto;gap:1.5rem">
    <div style="grid-row:span 2;background:url('{{HERO_IMAGE_URL}}') center/cover;border-radius:1rem;min-height:400px;position:relative">
      <div style="position:absolute;bottom:2rem;left:2rem;color:#fff">
        <h1 style="font-size:clamp(2rem,4vw,3rem)">{{HEADLINE}}</h1>
        <a href="#contact" class="btn-primary" style="margin-top:1rem;display:inline-block">{{CTA_TEXT}}</a>
      </div>
    </div>
    <div style="background:var(--color-primary);color:#fff;border-radius:1rem;padding:2rem">
      <p style="font-size:2.5rem;font-weight:bold">{{STAT_1_VALUE}}</p>
      <p>{{STAT_1_LABEL}}</p>
    </div>
    <div style="background:#f5f5f5;border-radius:1rem;padding:2rem">
      <p style="font-size:2.5rem;font-weight:bold">{{STAT_2_VALUE}}</p>
      <p>{{STAT_2_LABEL}}</p>
    </div>
    <div style="background:var(--color-accent);color:#fff;border-radius:1rem;padding:2rem">
      <p style="font-size:1.1rem">{{SUBHEADLINE}}</p>
    </div>
    <div style="background:#f5f5f5;border-radius:1rem;padding:2rem">
      <p style="font-size:2.5rem;font-weight:bold">{{STAT_3_VALUE}}</p>
      <p>{{STAT_3_LABEL}}</p>
    </div>
  </div>
</section>
<section style="padding:4rem 3rem">
  <div style="display:flex;gap:1rem;margin-bottom:2rem" role="tablist">{{TAB_BUTTONS}}</div>
  <div class="tab-content">{{TABBED_FEATURE_CONTENT}}</div>
</section>
<section style="padding:4rem 3rem;background:#f5f5f5" id="contact">
  <h2 style="font-size:2rem;margin-bottom:2rem">{{CTA_HEADLINE}}</h2>
  <form id="contact-form">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:2rem 3rem;background:#111;color:#fff">{{FOOTER_CONTENT}}</footer>`
  },

  'warm-sunset': {
    hero: 'centered-with-circular-image',
    description: 'Everything centered. Circular hero image. Warm wave/curve dividers between sections.',
    structure: ['nav-centered', 'hero-centered-circle-image', 'wave-divider', 'features-icon-grid', 'wave-divider', 'story-section', 'testimonials-warm', 'contact-centered', 'footer-warm'],
    skeleton: `
<nav style="padding:1.5rem 4rem;display:flex;justify-content:space-between;align-items:center">
  <div class="logo">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none">{{NAV_LINKS}}</ul>
  <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
</nav>
<section style="padding:6rem 4rem;text-align:center">
  <img src="{{HERO_IMAGE_URL}}" alt="" style="width:320px;height:320px;border-radius:50%;object-fit:cover;margin:0 auto 2rem;display:block;box-shadow:0 20px 60px rgba(0,0,0,0.15)">
  <h1 style="font-size:clamp(2.5rem,5vw,4rem);max-width:700px;margin:0 auto">{{HEADLINE}}</h1>
  <p style="font-size:1.15rem;margin:1.5rem auto;max-width:500px;color:#666">{{SUBHEADLINE}}</p>
  <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
</section>
<div style="line-height:0"><svg viewBox="0 0 1440 80" fill="var(--color-light)"><path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z"/></svg></div>
<section style="padding:6rem 4rem;background:var(--color-light)">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:2rem">{{ICON_FEATURE_CARDS}}</div>
</section>
<div style="line-height:0"><svg viewBox="0 0 1440 80" fill="var(--color-light)" transform="scale(1,-1)"><path d="M0,40 C360,80 1080,0 1440,40 L1440,80 L0,80 Z"/></svg></div>
<section style="padding:6rem 4rem;display:grid;grid-template-columns:1fr 1fr;gap:4rem;align-items:center">
  <img src="{{STORY_IMAGE}}" alt="" style="border-radius:1rem;width:100%">
  <div><h2>{{STORY_HEADLINE}}</h2><p>{{STORY_TEXT}}</p></div>
</section>
<section id="contact" style="padding:6rem 4rem;text-align:center;background:var(--color-light)">
  <h2>{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:500px;margin:2rem auto">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:3rem 4rem;background:var(--color-primary);color:#fff">{{FOOTER_CONTENT}}</footer>`
  },

  'neon-pulse': {
    hero: 'asymmetric-broken-grid',
    description: 'Elements intentionally break the grid. Overlapping layers, z-index stacking. Masonry feature grid.',
    structure: ['nav-asymmetric', 'hero-broken-grid', 'masonry-features', 'marquee-band', 'contact-split-dark', 'footer-creative'],
    skeleton: `
<nav style="padding:1.5rem 3rem;display:flex;justify-content:space-between;align-items:center;position:relative;z-index:10">
  <div class="logo" style="font-size:1.5rem;font-weight:900">{{LOGO_OR_NAME}}</div>
  <a href="#contact" class="btn-primary" style="background:var(--color-accent)">{{CTA_TEXT}}</a>
</nav>
<section style="position:relative;min-height:90vh;overflow:hidden;padding:3rem">
  <h1 style="font-size:clamp(3.5rem,9vw,8rem);line-height:0.9;position:relative;z-index:2;max-width:600px">{{HEADLINE}}</h1>
  <img src="{{HERO_IMAGE_URL}}" alt="" style="position:absolute;right:-5%;top:0;width:55%;height:100%;object-fit:cover;z-index:1">
  <div style="position:absolute;bottom:4rem;left:3rem;z-index:3">
    <p style="font-size:1.1rem;max-width:350px;background:var(--color-accent);padding:1.5rem;color:#fff">{{SUBHEADLINE}}</p>
    <a href="#contact" class="btn-dark" style="margin-top:1rem;display:inline-block">{{CTA_TEXT}}</a>
  </div>
</section>
<section style="padding:6rem 3rem;columns:3;column-gap:1.5rem">{{MASONRY_FEATURE_BLOCKS}}</section>
<div style="background:#111;padding:1.5rem 0;overflow:hidden;white-space:nowrap">
  <div style="display:inline-block;animation:marquee 20s linear infinite">{{MARQUEE_TEXT_ITEMS}}</div>
</div>
<section id="contact" style="padding:6rem 3rem;display:grid;grid-template-columns:1fr 1fr;background:#111;color:#fff;gap:4rem">
  <div><h2 style="font-size:2.5rem">{{CTA_HEADLINE}}</h2><p>{{CTA_SUBTEXT}}</p></div>
  <form id="contact-form">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:2rem 3rem;background:#000;color:#555;display:flex;justify-content:space-between">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'sage-earth': {
    hero: 'centered-organic',
    description: 'Organic centered layout. Flowing organic shapes between sections (SVG blobs/waves). Natural card grid.',
    structure: ['nav-natural', 'hero-centered-organic', 'organic-blob-divider', 'features-organic-grid', 'story-2col', 'testimonials-nature', 'contact-organic', 'footer-earthy'],
    skeleton: `
<nav style="padding:1.5rem 4rem;display:flex;justify-content:space-between;align-items:center">
  <div class="logo">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none">{{NAV_LINKS}}</ul>
  <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
</nav>
<section style="padding:6rem 4rem;text-align:center;background:var(--color-light)">
  <p style="font-size:0.85rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--color-accent);margin-bottom:1rem">{{TAGLINE}}</p>
  <h1 style="font-size:clamp(2.5rem,5vw,4rem);max-width:700px;margin:0 auto 1.5rem">{{HEADLINE}}</h1>
  <p style="font-size:1.1rem;max-width:520px;margin:0 auto 2.5rem;color:#666">{{SUBHEADLINE}}</p>
  <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
  <img src="{{HERO_IMAGE_URL}}" alt="" style="width:100%;max-width:800px;border-radius:2rem;margin-top:4rem;object-fit:cover;max-height:500px">
</section>
<svg viewBox="0 0 1440 120" style="display:block;margin-top:-2px"><path d="M0,64 C200,120 400,0 600,60 C800,120 1000,20 1200,80 C1350,120 1440,80 1440,80 L1440,120 L0,120Z" fill="#fff"/></svg>
<section style="padding:4rem 4rem 6rem">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:2rem">{{ORGANIC_FEATURE_CARDS}}</div>
</section>
<section style="padding:6rem 4rem;display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:center">
  <div><h2>{{STORY_HEADLINE}}</h2><p>{{STORY_TEXT}}</p><a href="#contact" class="btn-primary" style="margin-top:1.5rem;display:inline-block">{{CTA_TEXT}}</a></div>
  <img src="{{STORY_IMAGE}}" alt="" style="border-radius:2rem;width:100%;object-fit:cover">
</section>
<section id="contact" style="padding:6rem 4rem;text-align:center;background:var(--color-light)">
  <h2>{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:480px;margin:2rem auto">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:3rem 4rem;background:var(--color-dark);color:rgba(255,255,255,0.7)">{{FOOTER_CONTENT}}</footer>`
  },

  'midnight-gold': {
    hero: 'editorial-magazine',
    description: 'Magazine editorial layout. Large floating headline over full-width image. Luxury wide-margin grid.',
    structure: ['nav-editorial', 'hero-editorial-magazine', 'editorial-feature-grid', 'full-width-image-break', 'editorial-testimonial', 'contact-editorial', 'footer-editorial'],
    skeleton: `
<nav style="padding:1rem 5rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,0.1);position:fixed;top:0;width:100%;z-index:100;background:var(--color-dark)">
  <div class="logo" style="color:#fff;font-size:1.2rem;letter-spacing:0.1em;text-transform:uppercase">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2.5rem;list-style:none"><li><a style="color:rgba(255,255,255,0.7);font-size:0.85rem;letter-spacing:0.08em;text-transform:uppercase">{{NAV_LINKS}}</a></li></ul>
  <a href="#contact" style="color:var(--color-accent);font-size:0.85rem;letter-spacing:0.08em;text-transform:uppercase">{{CTA_TEXT}} →</a>
</nav>
<section style="padding-top:80px;position:relative">
  <img src="{{HERO_IMAGE_URL}}" alt="" style="width:100%;height:85vh;object-fit:cover;display:block">
  <div style="position:absolute;bottom:0;left:5rem;right:5rem;padding-bottom:4rem">
    <p style="color:var(--color-accent);font-size:0.8rem;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:1rem">{{CATEGORY_OR_TAGLINE}}</p>
    <h1 style="font-size:clamp(3rem,7vw,6rem);color:#fff;line-height:1;max-width:750px">{{HEADLINE}}</h1>
  </div>
</section>
<section style="padding:6rem 5rem">
  <div style="display:grid;grid-template-columns:1fr 2fr;gap:5rem;align-items:start">
    <div style="position:sticky;top:6rem">
      <p style="font-size:1.3rem;line-height:1.7;color:#555">{{SUBHEADLINE}}</p>
      <a href="#contact" class="btn-primary" style="margin-top:2rem;display:inline-block">{{CTA_TEXT}}</a>
    </div>
    <div>{{EDITORIAL_FEATURE_CONTENT}}</div>
  </div>
</section>
<img src="{{BREAK_IMAGE}}" alt="" style="width:100%;height:60vh;object-fit:cover;display:block">
<section style="padding:8rem 5rem;text-align:center;background:var(--color-dark);color:#fff">
  <p style="font-size:0.75rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--color-accent);margin-bottom:2rem">— Client Testimonial —</p>
  <blockquote style="font-size:clamp(1.5rem,3vw,2.2rem);font-style:italic;max-width:750px;margin:0 auto;line-height:1.5">"{{TESTIMONIAL}}"</blockquote>
  <p style="margin-top:2rem;color:rgba(255,255,255,0.5);font-size:0.9rem;letter-spacing:0.08em;text-transform:uppercase">{{TESTIMONIAL_AUTHOR}}</p>
</section>
<section id="contact" style="padding:8rem 5rem;display:grid;grid-template-columns:1fr 1fr;gap:6rem">
  <div><h2 style="font-size:2.5rem">{{CTA_HEADLINE}}</h2><p style="color:#555;margin-top:1rem">{{CTA_SUBTEXT}}</p></div>
  <form id="contact-form">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:3rem 5rem;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:0.8rem;color:#999;letter-spacing:0.05em;text-transform:uppercase">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'fresh-mint': {
    hero: 'diagonal-angled',
    description: 'Diagonal/angled section dividers using CSS clip-path. Zigzag alternating full-bleed colored sections.',
    structure: ['nav-energetic', 'hero-diagonal', 'features-diagonal-alternating', 'stats-diagonal', 'contact-diagonal', 'footer'],
    skeleton: `
<nav style="padding:1rem 3rem;display:flex;justify-content:space-between;align-items:center;background:var(--color-primary)">
  <div class="logo" style="color:#fff;font-weight:900">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none"><li style="color:rgba(255,255,255,0.8)">{{NAV_LINKS}}</li></ul>
  <a href="#contact" class="btn-accent">{{CTA_TEXT}}</a>
</nav>
<section style="background:var(--color-primary);color:#fff;padding:8rem 4rem 12rem;clip-path:polygon(0 0,100% 0,100% 85%,0 100%)">
  <div style="max-width:650px">
    <h1 style="font-size:clamp(2.5rem,5vw,4.5rem);line-height:1.1">{{HEADLINE}}</h1>
    <p style="font-size:1.15rem;margin:1.5rem 0;opacity:0.85">{{SUBHEADLINE}}</p>
    <a href="#contact" class="btn-accent">{{CTA_TEXT}}</a>
  </div>
</section>
<section style="padding:4rem 4rem 10rem;margin-top:-4rem;clip-path:polygon(0 5%,100% 0,100% 95%,0 100%);background:#fff">
  {{FEATURE_BLOCK_1}}
</section>
<section style="padding:6rem 4rem 10rem;margin-top:-4rem;clip-path:polygon(0 0,100% 5%,100% 100%,0 95%);background:var(--color-light)">
  {{FEATURE_BLOCK_2}}
</section>
<section style="padding:4rem 4rem 10rem;background:var(--color-accent);color:#fff;clip-path:polygon(0 5%,100% 0,100% 100%,0 100%);text-align:center">
  <div style="display:flex;justify-content:center;gap:5rem">{{STATS_ROW}}</div>
</section>
<section id="contact" style="padding:8rem 4rem;background:#fff;text-align:center">
  <h2>{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:500px;margin:2rem auto">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:3rem 4rem;background:var(--color-primary);color:#fff">{{FOOTER_CONTENT}}</footer>`
  },

  'brutalist-raw': {
    hero: 'brutalist-anti-design',
    description: 'Anti-design. Visible grid borders. Raw HTML feel. Off-grid intentional misalignment. Black borders, stark type.',
    structure: ['nav-brutalist', 'hero-brutalist', 'features-brutalist-grid', 'quote-brutalist', 'contact-brutalist', 'footer-brutalist'],
    skeleton: `
<nav style="border-bottom:3px solid #000;padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;background:#fff">
  <div class="logo" style="font-weight:900;font-size:1.3rem;text-transform:uppercase;letter-spacing:-0.02em">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:0;list-style:none;border:2px solid #000">
    <li style="padding:0.5rem 1rem;border-right:2px solid #000"><a style="text-decoration:none;font-weight:700;text-transform:uppercase;font-size:0.85rem">{{NAV_LINK_1}}</a></li>
    <li style="padding:0.5rem 1rem"><a href="#contact" style="text-decoration:none;font-weight:700;text-transform:uppercase;font-size:0.85rem">{{CTA_TEXT}}</a></li>
  </ul>
</nav>
<section style="border-bottom:3px solid #000;display:grid;grid-template-columns:1fr 1fr;min-height:80vh">
  <div style="padding:4rem;border-right:3px solid #000;display:flex;flex-direction:column;justify-content:flex-end">
    <h1 style="font-size:clamp(3rem,8vw,7rem);line-height:0.9;font-weight:900;letter-spacing:-0.04em">{{HEADLINE}}</h1>
    <a href="#contact" style="display:inline-block;margin-top:2rem;padding:1rem 2rem;background:#000;color:#fff;font-weight:700;text-transform:uppercase;text-decoration:none;font-size:0.9rem">{{CTA_TEXT}}</a>
  </div>
  <img src="{{HERO_IMAGE_URL}}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:grayscale(20%)">
</section>
<section style="display:grid;grid-template-columns:repeat(3,1fr);border-bottom:3px solid #000">
  {{FEATURE_CELLS_WITH_BORDERS}}
</section>
<section style="padding:4rem;border-bottom:3px solid #000;background:#ff0">
  <p style="font-size:clamp(2rem,5vw,4rem);font-weight:900;line-height:1;max-width:800px">"{{PULLQUOTE}}"</p>
</section>
<section id="contact" style="display:grid;grid-template-columns:1fr 1fr;border-bottom:3px solid #000">
  <div style="padding:4rem;border-right:3px solid #000">
    <h2 style="font-size:2.5rem;font-weight:900;text-transform:uppercase">{{CTA_HEADLINE}}</h2>
  </div>
  <div style="padding:4rem"><form id="contact-form">{{FORM_FIELDS}}</form></div>
</section>
<footer style="padding:1.5rem 2rem;background:#000;color:#fff;display:flex;justify-content:space-between;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'royal-navy': {
    hero: 'sidebar-layout',
    description: 'Fixed left sidebar navigation. Document-structured content scrolls right. Conservative enterprise grid.',
    structure: ['sidebar-nav-fixed', 'main-content-hero', 'features-structured-rows', 'credentials-band', 'contact-formal', 'footer-corporate'],
    skeleton: `
<div style="display:grid;grid-template-columns:260px 1fr;min-height:100vh">
  <nav style="position:fixed;top:0;left:0;width:260px;height:100vh;background:var(--color-primary);color:#fff;padding:2.5rem 2rem;overflow-y:auto;z-index:100">
    <div class="logo" style="font-size:1.1rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:3rem">{{LOGO_OR_NAME}}</div>
    <ul style="list-style:none;display:flex;flex-direction:column;gap:0.25rem">{{SIDEBAR_NAV_LINKS}}</ul>
    <div style="position:absolute;bottom:2rem;left:2rem;right:2rem">
      <a href="#contact" class="btn-accent" style="display:block;text-align:center">{{CTA_TEXT}}</a>
    </div>
  </nav>
  <main style="margin-left:260px">
    <section style="padding:5rem 5rem;background:var(--color-light)">
      <p style="font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--color-accent);margin-bottom:1rem">{{TAGLINE}}</p>
      <h1 style="font-size:clamp(2.5rem,4vw,3.5rem);max-width:650px;line-height:1.15">{{HEADLINE}}</h1>
      <p style="font-size:1.1rem;color:#555;max-width:550px;margin:1.5rem 0">{{SUBHEADLINE}}</p>
      <img src="{{HERO_IMAGE_URL}}" alt="" style="width:100%;border-radius:0.5rem;margin-top:2rem;max-height:420px;object-fit:cover">
    </section>
    <section style="padding:4rem 5rem;border-bottom:1px solid #eee">{{STRUCTURED_FEATURE_ROWS}}</section>
    <section style="padding:4rem 5rem;background:#f8f9fa;display:flex;gap:3rem;flex-wrap:wrap">{{CREDENTIALS_AND_LOGOS}}</section>
    <section id="contact" style="padding:4rem 5rem">
      <h2 style="font-size:2rem;margin-bottom:2rem">{{CTA_HEADLINE}}</h2>
      <form id="contact-form" style="max-width:560px">{{FORM_FIELDS}}</form>
    </section>
    <footer style="padding:2rem 5rem;background:var(--color-primary);color:rgba(255,255,255,0.7);font-size:0.85rem">{{FOOTER_CONTENT}}</footer>
  </main>
</div>`
  },

  'candy-pop': {
    hero: 'block-stack-colorful',
    description: 'Full-width solid color blocks stacked vertically. Overlapping playful cards. Cutout shapes.',
    structure: ['nav-colorful', 'hero-block-yellow', 'features-overlapping-cards', 'color-block-2', 'testimonials-playful', 'contact-block-colorful', 'footer-playful'],
    skeleton: `
<nav style="padding:1rem 3rem;display:flex;justify-content:space-between;align-items:center;background:var(--color-accent);position:sticky;top:0;z-index:100">
  <div class="logo" style="font-weight:900;font-size:1.4rem">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none">{{NAV_LINKS}}</ul>
  <a href="#contact" style="background:#000;color:#fff;padding:0.6rem 1.5rem;border-radius:999px;font-weight:700;text-decoration:none">{{CTA_TEXT}}</a>
</nav>
<section style="background:#FFE566;padding:8rem 4rem;position:relative;overflow:visible">
  <h1 style="font-size:clamp(3rem,8vw,7rem);font-weight:900;line-height:0.9;max-width:700px">{{HEADLINE}}</h1>
  <img src="{{HERO_IMAGE_URL}}" alt="" style="position:absolute;right:4rem;top:50%;transform:translateY(-50%);width:40%;border-radius:2rem;box-shadow:8px 8px 0 #000">
</section>
<section style="background:var(--color-primary);padding:8rem 4rem 12rem;position:relative">
  <div style="display:flex;gap:2rem;flex-wrap:wrap;justify-content:center;position:relative;z-index:2">{{OVERLAPPING_FEATURE_CARDS}}</div>
</section>
<section style="background:#B8F5C8;padding:8rem 4rem;text-align:center">
  <h2 style="font-size:clamp(2rem,4vw,3.5rem);font-weight:900">{{SECONDARY_HEADLINE}}</h2>
  <div style="display:flex;gap:1.5rem;flex-wrap:wrap;justify-content:center;margin-top:3rem">{{TESTIMONIAL_BUBBLE_CARDS}}</div>
</section>
<section id="contact" style="background:var(--color-accent);padding:8rem 4rem;text-align:center">
  <h2 style="font-size:2.5rem;font-weight:900">{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:480px;margin:2rem auto;background:#fff;padding:2rem;border-radius:1rem;box-shadow:6px 6px 0 #000">{{FORM_FIELDS}}</form>
</section>
<footer style="background:#000;color:#fff;padding:2rem 3rem;display:flex;justify-content:space-between;font-weight:700">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'aurora': {
    hero: 'glassmorphism-floating',
    description: 'Glassmorphism panels floating on gradient background. Sci-fi layered depth. Futuristic UI cards.',
    structure: ['nav-glass', 'hero-gradient-glass', 'features-glass-cards', 'glow-stats-band', 'contact-glass-form', 'footer-dark-gradient'],
    skeleton: `
<div style="background:linear-gradient(135deg,#0a0a2e 0%,#1a0a3e 40%,#0a1a3e 70%,#0a2a2e 100%);min-height:100vh">
<nav style="position:fixed;top:0;width:100%;z-index:100;padding:1rem 4rem;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.1)">
  <div class="logo" style="color:#fff;font-weight:700">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none"><li style="color:rgba(255,255,255,0.7)">{{NAV_LINKS}}</li></ul>
  <a href="#contact" style="background:linear-gradient(135deg,var(--color-accent),var(--color-primary));color:#fff;padding:0.6rem 1.5rem;border-radius:0.5rem;text-decoration:none;font-weight:600">{{CTA_TEXT}}</a>
</nav>
<section style="padding:12rem 4rem 8rem;text-align:center;position:relative">
  <div style="position:absolute;top:20%;left:20%;width:400px;height:400px;background:rgba(100,50,255,0.2);border-radius:50%;filter:blur(80px)"></div>
  <div style="position:absolute;top:30%;right:15%;width:300px;height:300px;background:rgba(0,200,255,0.15);border-radius:50%;filter:blur(60px)"></div>
  <p style="color:var(--color-accent);font-size:0.85rem;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:1.5rem;position:relative">{{TAGLINE}}</p>
  <h1 style="font-size:clamp(3rem,7vw,6rem);color:#fff;line-height:1;max-width:800px;margin:0 auto;position:relative">{{HEADLINE}}</h1>
  <p style="color:rgba(255,255,255,0.6);font-size:1.15rem;max-width:550px;margin:2rem auto;position:relative">{{SUBHEADLINE}}</p>
  <a href="#contact" style="background:linear-gradient(135deg,var(--color-accent),var(--color-primary));color:#fff;padding:0.9rem 2.5rem;border-radius:0.5rem;text-decoration:none;font-weight:600;display:inline-block;position:relative;margin-top:1rem">{{CTA_TEXT}}</a>
</section>
<section style="padding:6rem 4rem">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.5rem">{{GLASS_FEATURE_CARDS}}</div>
</section>
<section style="padding:6rem 4rem;display:flex;justify-content:center;gap:4rem;flex-wrap:wrap">{{GLOW_STAT_ITEMS}}</section>
<section id="contact" style="padding:6rem 4rem;text-align:center">
  <h2 style="color:#fff;font-size:2.5rem">{{CTA_HEADLINE}}</h2>
  <div style="max-width:520px;margin:2rem auto;background:rgba(255,255,255,0.05);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.1);border-radius:1rem;padding:2.5rem">
    <form id="contact-form">{{FORM_FIELDS}}</form>
  </div>
</section>
<footer style="padding:2rem 4rem;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;color:rgba(255,255,255,0.4);font-size:0.85rem">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>
</div>`
  },

  'gospel-bold': {
    hero: 'full-screen-sections',
    description: 'Each section fills the full viewport. Dramatic stage-like impact statements. Powerful vertical scroll.',
    structure: ['nav-church', 'hero-fullscreen-1', 'fullscreen-section-2', 'fullscreen-section-3', 'fullscreen-contact', 'footer-faith'],
    skeleton: `
<nav style="position:fixed;top:0;width:100%;z-index:100;padding:1.5rem 4rem;display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.85);backdrop-filter:blur(10px)">
  <div class="logo" style="color:#fff;font-size:1.3rem;font-weight:900;text-transform:uppercase;letter-spacing:0.05em">{{LOGO_OR_NAME}}</div>
  <a href="#contact" style="background:var(--color-accent);color:#fff;padding:0.7rem 2rem;border-radius:0.3rem;text-decoration:none;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;font-size:0.9rem">{{CTA_TEXT}}</a>
</nav>
<section style="height:100vh;background:url('{{HERO_IMAGE_URL}}') center/cover no-repeat;position:relative;display:flex;align-items:center;justify-content:center">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,0.6)"></div>
  <div style="position:relative;z-index:2;text-align:center;color:#fff;padding:2rem">
    <p style="font-size:0.85rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--color-accent);margin-bottom:1.5rem">{{CHURCH_NAME_OR_MINISTRY}}</p>
    <h1 style="font-size:clamp(3rem,8vw,7rem);font-weight:900;line-height:1;max-width:800px">{{HEADLINE}}</h1>
    <a href="#contact" style="display:inline-block;margin-top:2.5rem;background:var(--color-accent);color:#fff;padding:1rem 3rem;text-decoration:none;font-weight:700;font-size:1.1rem;text-transform:uppercase;letter-spacing:0.05em">{{CTA_TEXT}}</a>
  </div>
</section>
<section style="height:100vh;background:var(--color-primary);display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;padding:4rem">
  <div style="max-width:800px">
    <h2 style="font-size:clamp(2.5rem,6vw,5rem);font-weight:900;line-height:1.1">{{SECTION_2_HEADLINE}}</h2>
    <p style="font-size:1.2rem;opacity:0.85;margin-top:2rem;max-width:600px;margin-left:auto;margin-right:auto">{{SECTION_2_TEXT}}</p>
  </div>
</section>
<section style="height:100vh;background:#fff;display:flex;align-items:center;padding:4rem 6rem">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6rem;align-items:center;width:100%">
    <img src="{{SECTION_3_IMAGE}}" alt="" style="width:100%;border-radius:0.5rem;max-height:70vh;object-fit:cover">
    <div>
      <h2 style="font-size:clamp(2rem,4vw,3.5rem);font-weight:900;line-height:1.1">{{SECTION_3_HEADLINE}}</h2>
      <p style="font-size:1.1rem;color:#555;margin:1.5rem 0;line-height:1.7">{{SECTION_3_TEXT}}</p>
      <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
    </div>
  </div>
</section>
<section id="contact" style="height:100vh;background:var(--color-dark);color:#fff;display:flex;align-items:center;justify-content:center;text-align:center;padding:4rem">
  <div style="width:100%;max-width:560px">
    <h2 style="font-size:clamp(2rem,4vw,3rem);font-weight:900;margin-bottom:2.5rem">{{CTA_HEADLINE}}</h2>
    <form id="contact-form">{{FORM_FIELDS}}</form>
  </div>
</section>
<footer style="padding:2rem 4rem;background:#000;color:rgba(255,255,255,0.5);text-align:center;font-size:0.85rem">
  {{BUSINESS_NAME}} · © {{YEAR}} · {{FOOTER_LINKS}}
</footer>`
  },

  'soft-blush': {
    hero: 'centered-feminine',
    description: 'Centered feminine layout. Overlapping soft circles/shapes. Rounded everything. Soft pastel card grid.',
    structure: ['nav-soft', 'hero-centered-soft', 'features-rounded-soft', 'about-overlapping', 'testimonials-soft', 'contact-soft', 'footer-blush'],
    skeleton: `
<nav style="padding:1.5rem 4rem;display:flex;justify-content:space-between;align-items:center">
  <div class="logo" style="font-style:italic;font-size:1.4rem">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none">{{NAV_LINKS}}</ul>
  <a href="#contact" style="border:1.5px solid var(--color-primary);color:var(--color-primary);padding:0.6rem 1.5rem;border-radius:999px;text-decoration:none;font-size:0.9rem">{{CTA_TEXT}}</a>
</nav>
<section style="padding:5rem 4rem;text-align:center;background:var(--color-light)">
  <div style="position:relative;width:280px;height:280px;margin:0 auto 3rem">
    <img src="{{HERO_IMAGE_URL}}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">
    <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;background:var(--color-accent);opacity:0.3"></div>
    <div style="position:absolute;bottom:-15px;left:-15px;width:70px;height:70px;border-radius:50%;background:var(--color-primary);opacity:0.2"></div>
  </div>
  <h1 style="font-size:clamp(2.5rem,5vw,4rem);font-weight:700;max-width:650px;margin:0 auto;line-height:1.2">{{HEADLINE}}</h1>
  <p style="font-size:1.1rem;color:#888;max-width:480px;margin:1.5rem auto">{{SUBHEADLINE}}</p>
  <a href="#contact" style="background:var(--color-primary);color:#fff;padding:0.8rem 2.5rem;border-radius:999px;text-decoration:none;font-size:0.95rem;display:inline-block;margin-top:0.5rem">{{CTA_TEXT}}</a>
</section>
<section style="padding:6rem 4rem">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:2rem">{{SOFT_FEATURE_CARDS_ROUNDED}}</div>
</section>
<section style="padding:6rem 4rem;position:relative">
  <div style="background:var(--color-light);border-radius:3rem;padding:5rem;display:grid;grid-template-columns:1fr 1fr;gap:4rem;align-items:center">
    <img src="{{ABOUT_IMAGE}}" alt="" style="border-radius:2rem;width:100%;object-fit:cover">
    <div><h2>{{ABOUT_HEADLINE}}</h2><p style="color:#666;margin-top:1rem;line-height:1.8">{{ABOUT_TEXT}}</p></div>
  </div>
</section>
<section id="contact" style="padding:6rem 4rem;text-align:center;background:var(--color-light)">
  <h2>{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:480px;margin:2rem auto">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:3rem 4rem;background:var(--color-primary);color:#fff;text-align:center">{{FOOTER_CONTENT}}</footer>`
  },

  'terracotta': {
    hero: 'editorial-multicolumn',
    description: 'Newspaper-style multi-column editorial. Strong typographic hierarchy. Full-width imagery as punctuation.',
    structure: ['nav-editorial-minimal', 'hero-newspaper-columns', 'full-width-image-break', 'editorial-content-grid', 'quote-full-width', 'contact-editorial', 'footer-editorial'],
    skeleton: `
<nav style="border-bottom:2px solid #000;padding:1rem 4rem">
  <div style="text-align:center;font-size:2rem;font-weight:900;letter-spacing:-0.02em;margin-bottom:0.5rem">{{LOGO_OR_NAME}}</div>
  <div style="display:flex;justify-content:space-between;align-items:center;padding-top:0.5rem;border-top:1px solid #000">
    <ul style="display:flex;gap:2rem;list-style:none;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em">{{NAV_LINKS}}</ul>
    <a href="#contact" style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;text-decoration:none;color:#000">{{CTA_TEXT}} →</a>
  </div>
</nav>
<section style="padding:4rem;display:grid;grid-template-columns:2fr 1fr;gap:3rem;border-bottom:1px solid #ddd">
  <div>
    <p style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.15em;color:#888;margin-bottom:1rem">{{CATEGORY}}</p>
    <h1 style="font-size:clamp(2.5rem,5vw,4.5rem);line-height:1;font-weight:900;margin-bottom:2rem">{{HEADLINE}}</h1>
    <img src="{{HERO_IMAGE_URL}}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover">
  </div>
  <div style="padding-top:2rem;border-left:1px solid #ddd;padding-left:2rem">
    <p style="font-size:1.05rem;line-height:1.7;color:#444">{{SUBHEADLINE}}</p>
    <a href="#contact" style="display:inline-block;margin-top:2rem;background:#000;color:#fff;padding:0.8rem 2rem;text-decoration:none;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.08em">{{CTA_TEXT}}</a>
  </div>
</section>
<section style="padding:4rem;columns:3;column-gap:2rem;border-bottom:1px solid #ddd">{{EDITORIAL_MULTI_COLUMN_CONTENT}}</section>
<img src="{{BREAK_IMAGE}}" alt="" style="width:100%;height:500px;object-fit:cover;display:block">
<section style="padding:4rem;text-align:center;border-bottom:1px solid #ddd">
  <blockquote style="font-size:clamp(1.8rem,3vw,2.5rem);font-style:italic;max-width:750px;margin:0 auto;line-height:1.4">"{{PULLQUOTE}}"</blockquote>
</section>
<section id="contact" style="padding:4rem;display:grid;grid-template-columns:1fr 1fr;gap:4rem;border-top:2px solid #000">
  <div><h2 style="font-size:2rem;font-weight:900">{{CTA_HEADLINE}}</h2></div>
  <form id="contact-form">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:2rem 4rem;background:#2c1810;color:rgba(255,255,255,0.6);display:flex;justify-content:space-between;font-size:0.8rem">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'electric-blue': {
    hero: 'split-with-stat-sidebar',
    description: 'Split hero with live stats sidebar. Feature comparison section. Structured corporate trust-builder.',
    structure: ['nav-corporate', 'hero-split-stats', 'features-comparison-table', 'logos-band', 'testimonials-corporate', 'contact-corporate', 'footer-corporate'],
    skeleton: `
<nav style="padding:1rem 3rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;background:#fff;position:sticky;top:0;z-index:100">
  <div class="logo" style="font-weight:700">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none;font-size:0.9rem">{{NAV_LINKS}}</ul>
  <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
</nav>
<section style="display:grid;grid-template-columns:1fr 380px;min-height:75vh">
  <div style="padding:5rem;background:var(--color-primary);color:#fff;display:flex;flex-direction:column;justify-content:center">
    <p style="font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase;opacity:0.7;margin-bottom:1.5rem">{{TAGLINE}}</p>
    <h1 style="font-size:clamp(2.5rem,4vw,3.8rem);line-height:1.1;max-width:580px">{{HEADLINE}}</h1>
    <p style="font-size:1.05rem;opacity:0.85;max-width:480px;margin-top:1.5rem">{{SUBHEADLINE}}</p>
    <div style="display:flex;gap:1rem;margin-top:2.5rem">
      <a href="#contact" class="btn-accent">{{CTA_TEXT}}</a>
      <a href="#features" style="color:#fff;padding:0.8rem 1.5rem;border:1px solid rgba(255,255,255,0.4);text-decoration:none;border-radius:0.3rem">Learn more</a>
    </div>
  </div>
  <div style="background:var(--color-dark);color:#fff;padding:3rem;display:flex;flex-direction:column;justify-content:center;gap:2rem">
    {{STAT_SIDEBAR_ITEMS}}
  </div>
</section>
<section id="features" style="padding:6rem 3rem">
  <h2 style="text-align:center;font-size:2rem;margin-bottom:3rem">{{FEATURES_HEADLINE}}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:0.95rem">{{COMPARISON_TABLE_ROWS}}</table>
</section>
<section style="padding:3rem;background:#f8f9fa;display:flex;gap:3rem;align-items:center;justify-content:center;flex-wrap:wrap">{{CLIENT_LOGO_ITEMS}}</section>
<section style="padding:6rem 3rem;background:#fff">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:2rem">{{CORPORATE_TESTIMONIAL_CARDS}}</div>
</section>
<section id="contact" style="padding:6rem 3rem;background:var(--color-light)">
  <div style="max-width:640px;margin:0 auto">
    <h2 style="font-size:2rem;margin-bottom:2rem">{{CTA_HEADLINE}}</h2>
    <form id="contact-form">{{FORM_FIELDS}}</form>
  </div>
</section>
<footer style="padding:3rem;background:var(--color-primary);color:rgba(255,255,255,0.7)">{{FOOTER_CONTENT}}</footer>`
  },

  'slate-pro': {
    hero: 'card-dashboard-panels',
    description: 'Enterprise SaaS. Card panel layout. Feature comparison. Pricing grid. Structured B2B layout.',
    structure: ['nav-saas', 'hero-saas-screenshot', 'features-3col-cards', 'pricing-grid', 'social-proof-logos', 'faq-accordion', 'contact-saas', 'footer-saas'],
    skeleton: `
<nav style="padding:1rem 4rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;background:#fff;position:sticky;top:0;z-index:100">
  <div style="display:flex;align-items:center;gap:3rem">
    <div class="logo" style="font-weight:800">{{LOGO_OR_NAME}}</div>
    <ul style="display:flex;gap:1.5rem;list-style:none;font-size:0.875rem;color:#64748b">{{NAV_LINKS}}</ul>
  </div>
  <div style="display:flex;gap:1rem">
    <a href="#" style="padding:0.5rem 1rem;font-size:0.875rem;text-decoration:none;color:#64748b">Log in</a>
    <a href="#contact" class="btn-primary" style="font-size:0.875rem">{{CTA_TEXT}}</a>
  </div>
</nav>
<section style="padding:6rem 4rem;text-align:center;background:linear-gradient(180deg,#f8fafc 0%,#fff 100%)">
  <div style="display:inline-block;background:#eff6ff;color:var(--color-primary);padding:0.3rem 1rem;border-radius:999px;font-size:0.8rem;font-weight:600;margin-bottom:1.5rem">{{BADGE_TEXT}}</div>
  <h1 style="font-size:clamp(2.5rem,5vw,4rem);font-weight:800;max-width:750px;margin:0 auto;line-height:1.15;letter-spacing:-0.02em">{{HEADLINE}}</h1>
  <p style="font-size:1.1rem;color:#64748b;max-width:580px;margin:1.5rem auto">{{SUBHEADLINE}}</p>
  <div style="display:flex;gap:1rem;justify-content:center;margin:2rem 0">
    <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
    <a href="#" style="padding:0.8rem 1.5rem;border:1px solid #e2e8f0;border-radius:0.5rem;text-decoration:none;color:#374151;font-size:0.9rem">Watch demo →</a>
  </div>
  <img src="{{HERO_IMAGE_URL}}" alt="" style="width:100%;max-width:900px;border-radius:1rem;border:1px solid #e2e8f0;box-shadow:0 20px 60px rgba(0,0,0,0.1);margin-top:2rem">
</section>
<section style="padding:6rem 4rem">
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem">{{FEATURE_PANEL_CARDS}}</div>
</section>
<section style="padding:6rem 4rem;background:#f8fafc">
  <h2 style="text-align:center;font-size:2rem;font-weight:800;margin-bottom:3rem">{{PRICING_HEADLINE}}</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;max-width:900px;margin:0 auto">{{PRICING_CARDS}}</div>
</section>
<section style="padding:3rem 4rem;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;display:flex;gap:3rem;align-items:center;justify-content:center">{{LOGO_ITEMS}}</section>
<section id="contact" style="padding:6rem 4rem;text-align:center">
  <h2 style="font-size:2rem;font-weight:800">{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:480px;margin:2rem auto">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:3rem 4rem;background:#0f172a;color:#94a3b8">{{FOOTER_CONTENT}}</footer>`
  },

  'desert-dusk': {
    hero: 'immersive-parallax',
    description: 'Full-width parallax sections. Artisan craft aesthetic. Wide editorial margins. Warm earthy full-bleeds.',
    structure: ['nav-artisan', 'hero-parallax-full', 'features-wide-margin-editorial', 'full-width-image-parallax-2', 'story-artisan', 'contact-artisan', 'footer-warm'],
    skeleton: `
<nav style="padding:2rem 5rem;display:flex;justify-content:space-between;align-items:center;position:fixed;top:0;width:100%;z-index:100;mix-blend-mode:multiply">
  <div class="logo" style="font-size:1.1rem;letter-spacing:0.08em;text-transform:uppercase;font-weight:600">{{LOGO_OR_NAME}}</div>
  <a href="#contact" style="font-size:0.85rem;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;color:#000">{{CTA_TEXT}}</a>
</nav>
<section style="height:100vh;background-attachment:fixed;background:url('{{HERO_IMAGE_URL}}') center/cover no-repeat;position:relative;display:flex;align-items:flex-end;padding:6rem 5rem">
  <div>
    <h1 style="font-size:clamp(3rem,7vw,6rem);color:#fff;line-height:1;max-width:700px;text-shadow:0 2px 20px rgba(0,0,0,0.3)">{{HEADLINE}}</h1>
    <a href="#contact" style="display:inline-block;margin-top:2rem;background:#fff;color:#000;padding:1rem 2.5rem;text-decoration:none;font-size:0.9rem;letter-spacing:0.05em;text-transform:uppercase;font-weight:600">{{CTA_TEXT}}</a>
  </div>
</section>
<section style="padding:8rem 5rem;max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1fr 2fr;gap:6rem">
  <div style="position:sticky;top:8rem;align-self:start">
    <p style="font-size:0.8rem;letter-spacing:0.15em;text-transform:uppercase;color:#888;margin-bottom:1rem">{{TAGLINE}}</p>
    <p style="font-size:1.05rem;line-height:1.8;color:#555">{{SUBHEADLINE}}</p>
  </div>
  <div>{{EDITORIAL_FEATURE_BLOCKS}}</div>
</section>
<section style="height:70vh;background-attachment:fixed;background:url('{{BREAK_IMAGE}}') center/cover no-repeat"></section>
<section style="padding:8rem 5rem;max-width:700px;margin:0 auto;text-align:center">
  <h2 style="font-size:clamp(2rem,4vw,3.5rem);line-height:1.2;margin-bottom:2rem">{{STORY_HEADLINE}}</h2>
  <p style="font-size:1.1rem;color:#555;line-height:1.8">{{STORY_TEXT}}</p>
  <a href="#contact" style="display:inline-block;margin-top:2.5rem;background:var(--color-primary);color:#fff;padding:1rem 2.5rem;text-decoration:none;font-size:0.9rem;letter-spacing:0.05em;text-transform:uppercase">{{CTA_TEXT}}</a>
</section>
<section id="contact" style="padding:8rem 5rem;background:var(--color-light)">
  <div style="max-width:560px;margin:0 auto">
    <h2 style="font-size:2rem;margin-bottom:2.5rem">{{CTA_HEADLINE}}</h2>
    <form id="contact-form">{{FORM_FIELDS}}</form>
  </div>
</section>
<footer style="padding:3rem 5rem;background:var(--color-dark);color:rgba(255,255,255,0.5);display:flex;justify-content:space-between;font-size:0.85rem">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'ocean-depth': {
    hero: 'stark-typographic-fullbleed',
    description: 'Brutally minimal. One dominant image. Text-only feature list. Stark high-contrast. Technical precision.',
    structure: ['nav-stark', 'hero-stark-split', 'features-text-only-list', 'single-image-full', 'quote-stark', 'contact-stark', 'footer-minimal'],
    skeleton: `
<nav style="padding:1.5rem 4rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #000">
  <div class="logo" style="font-weight:900;font-size:1rem;letter-spacing:0.1em;text-transform:uppercase">{{LOGO_OR_NAME}}</div>
  <a href="#contact" style="font-size:0.8rem;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;color:#000">{{CTA_TEXT}}</a>
</nav>
<section style="display:grid;grid-template-columns:1fr 1fr;min-height:90vh">
  <div style="padding:5rem;display:flex;flex-direction:column;justify-content:center;border-right:1px solid #000">
    <h1 style="font-size:clamp(2.5rem,5vw,4.5rem);font-weight:900;line-height:1;letter-spacing:-0.03em">{{HEADLINE}}</h1>
    <p style="font-size:1rem;color:#555;margin-top:2rem;max-width:400px;line-height:1.7">{{SUBHEADLINE}}</p>
    <a href="#contact" style="margin-top:3rem;display:inline-block;background:#000;color:#fff;padding:0.8rem 2rem;text-decoration:none;font-size:0.85rem;letter-spacing:0.08em;text-transform:uppercase;align-self:flex-start">{{CTA_TEXT}}</a>
  </div>
  <img src="{{HERO_IMAGE_URL}}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;filter:grayscale(100%)">
</section>
<section style="padding:6rem 4rem;border-top:1px solid #000;border-bottom:1px solid #000">
  <ol style="list-style:none;display:flex;flex-direction:column;gap:0;counter-reset:feature">{{NUMBERED_TEXT_FEATURE_LIST}}</ol>
</section>
<img src="{{BREAK_IMAGE}}" alt="" style="width:100%;height:60vh;object-fit:cover;display:block;filter:grayscale(80%)">
<section style="padding:6rem 4rem;border-top:1px solid #000">
  <p style="font-size:clamp(1.5rem,3vw,2.5rem);max-width:750px;line-height:1.4;font-style:italic">"{{PULLQUOTE}}"</p>
</section>
<section id="contact" style="padding:6rem 4rem;border-top:1px solid #000;display:grid;grid-template-columns:1fr 1fr;gap:4rem">
  <h2 style="font-size:2rem;font-weight:900">{{CTA_HEADLINE}}</h2>
  <form id="contact-form">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:1.5rem 4rem;border-top:1px solid #000;display:flex;justify-content:space-between;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.1em;color:#999">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'bold-minimalism': {
    hero: 'typographic-only',
    description: 'Giant headline fills viewport. No hero image. Text IS the design. Maximum whitespace. Large numbered features.',
    structure: ['nav-minimal', 'hero-typographic-mega', 'features-large-numbered', 'pullquote-fullwidth', 'gallery-offset-2col', 'contact-centered-minimal', 'footer-single-line'],
    skeleton: `
<nav style="padding:2rem 6rem;display:flex;justify-content:space-between">
  <div class="logo">{{LOGO_OR_NAME}}</div>
  <a href="#contact" style="font-size:0.9rem;letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;color:#000">{{CTA_TEXT}} →</a>
</nav>
<section style="padding:8rem 6rem;min-height:85vh;display:flex;flex-direction:column;justify-content:center">
  <h1 style="font-size:clamp(4.5rem,11vw,10rem);line-height:0.92;letter-spacing:-0.04em;max-width:950px;font-weight:900">{{HEADLINE}}</h1>
  <p style="font-size:1.1rem;max-width:440px;margin-top:3rem;color:#666;line-height:1.7">{{SUBHEADLINE}}</p>
  <a href="#contact" style="margin-top:2rem;display:inline-block;background:#000;color:#fff;padding:1rem 2.5rem;text-decoration:none;font-size:0.9rem;letter-spacing:0.05em">{{CTA_TEXT}}</a>
</section>
<section style="padding:0 6rem 8rem">
  {{LARGE_NUMBERED_FEATURES_01_02_03}}
</section>
<section style="padding:6rem;background:#111;color:#fff">
  <blockquote style="font-size:clamp(1.8rem,3.5vw,3rem);font-style:italic;max-width:850px;margin:0 auto;line-height:1.3">"{{PULLQUOTE}}"</blockquote>
</section>
<section style="padding:6rem;display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:end">
  <img src="{{IMAGE_1}}" alt="" style="width:100%;aspect-ratio:3/4;object-fit:cover">
  <div>
    <img src="{{IMAGE_2}}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;margin-bottom:3rem">
    <p style="font-size:1rem;color:#666;line-height:1.7">{{CAPTION_OR_EXTRA_COPY}}</p>
  </div>
</section>
<section id="contact" style="padding:8rem 6rem;text-align:center;border-top:1px solid #eee">
  <h2 style="font-size:2.5rem;font-weight:900">{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:500px;margin:3rem auto">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:2rem 6rem;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:0.8rem;color:#aaa">
  <span>{{BUSINESS_NAME}}</span><span>© {{YEAR}}</span>
</footer>`
  },

  'coral-energy': {
    hero: 'bento-grid-hero',
    description: 'Apple bento grid hero with stat cards + main visual. Tab-based feature sections.',
    structure: ['nav-standard', 'hero-bento-grid', 'features-tabbed', 'stats-band', 'contact-form', 'footer'],
    skeleton: `
<nav style="padding:1rem 3rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee;background:#fff">
  <div class="logo">{{LOGO_OR_NAME}}</div>
  <ul style="display:flex;gap:2rem;list-style:none">{{NAV_LINKS}}</ul>
  <a href="#contact" class="btn-primary">{{CTA_TEXT}}</a>
</nav>
<section style="padding:3rem">
  <div style="display:grid;grid-template-columns:2fr 1fr 1fr;grid-auto-rows:minmax(180px,auto);gap:1.5rem">
    <div style="grid-row:span 2;background:url('{{HERO_IMAGE_URL}}') center/cover;border-radius:1.5rem;position:relative;overflow:hidden;min-height:380px">
      <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.7),transparent)"></div>
      <div style="position:absolute;bottom:2rem;left:2rem;color:#fff">
        <h1 style="font-size:clamp(1.8rem,3vw,2.8rem);line-height:1.1">{{HEADLINE}}</h1>
        <a href="#contact" class="btn-primary" style="margin-top:1rem;display:inline-block">{{CTA_TEXT}}</a>
      </div>
    </div>
    <div style="background:var(--color-primary);color:#fff;border-radius:1.5rem;padding:2rem;display:flex;flex-direction:column;justify-content:flex-end">
      <p style="font-size:2.8rem;font-weight:900;line-height:1">{{STAT_1_VALUE}}</p>
      <p style="opacity:0.8;margin-top:0.25rem">{{STAT_1_LABEL}}</p>
    </div>
    <div style="background:var(--color-light);border-radius:1.5rem;padding:2rem;display:flex;flex-direction:column;justify-content:flex-end">
      <p style="font-size:2.8rem;font-weight:900;line-height:1">{{STAT_2_VALUE}}</p>
      <p style="color:#666;margin-top:0.25rem">{{STAT_2_LABEL}}</p>
    </div>
    <div style="background:var(--color-accent);color:#fff;border-radius:1.5rem;padding:2rem">{{SUBHEADLINE}}</div>
    <div style="background:#111;color:#fff;border-radius:1.5rem;padding:2rem;display:flex;flex-direction:column;justify-content:flex-end">
      <p style="font-size:2.8rem;font-weight:900;line-height:1">{{STAT_3_VALUE}}</p>
      <p style="opacity:0.7;margin-top:0.25rem">{{STAT_3_LABEL}}</p>
    </div>
  </div>
</section>
<section style="padding:4rem 3rem">{{TABBED_FEATURE_SECTION}}</section>
<section id="contact" style="padding:5rem 3rem;background:var(--color-light)">
  <h2 style="font-size:2rem;margin-bottom:2rem">{{CTA_HEADLINE}}</h2>
  <form id="contact-form" style="max-width:560px">{{FORM_FIELDS}}</form>
</section>
<footer style="padding:2rem 3rem;background:#111;color:#fff">{{FOOTER_CONTENT}}</footer>`
  }
};

// Fill in any missing styles with a clean default
const DEFAULT_STYLES = ['bold-minimalism', 'clean-precision', 'warm-sunset', 'dark-luxe'];
const ALL_STYLES = ['clean-precision','bold-minimalism','warm-sunset','dark-luxe','coral-energy','ocean-depth','neon-pulse','sage-earth','electric-blue','midnight-gold','fresh-mint','soft-blush','terracotta','brutalist-raw','royal-navy','candy-pop','slate-pro','desert-dusk','aurora','gospel-bold'];

// ── TOOL DEFINITIONS ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'get_layout_blueprint',
    description: 'Get the HTML skeleton and structural blueprint for a design style. ALWAYS call this before writing any website HTML. Returns a real layout structure — not just CSS colors. Each style has a genuinely different layout: split-hero, typographic, full-bleed cinematic, bento grid, editorial, brutalist, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        style_id: {
          type: 'string',
          enum: ALL_STYLES,
          description: 'Design style ID. Each has a distinct layout structure.'
        }
      },
      required: ['style_id']
    }
  },
  {
    name: 'bloom_clarify',
    description: 'Ask the user a clarifying question with clickable button options. Use for the pre-build gate questions (brand, purpose, pages, CTA, colors, domain, content, real details). ONE question at a time. Wait for answer before calling again.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the user' },
        context: { type: 'string', description: 'Brief context explaining why you need this information' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '2-4 button options for the user to click. Include "Other (I\'ll describe)" when relevant.'
        },
        allow_free_text: { type: 'boolean', default: true, description: 'Whether to show a free-text input alongside buttons' },
        session_id: { type: 'string', description: 'Current build session ID for response routing' }
      },
      required: ['question', 'options', 'session_id']
    }
  },
  {
    name: 'task_progress',
    description: 'Update the build checklist visible to the user. Call ONCE at the start with ALL steps, then call again to update individual step statuses as you complete them.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Build session ID' },
        org_id: { type: 'string', description: 'Organization ID' },
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string', description: 'Step description in imperative form' },
              activeForm: { type: 'string', description: 'Present continuous shown while in progress' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] },
              success_criteria: { type: 'string' }
            },
            required: ['id', 'content', 'status']
          }
        }
      },
      required: ['session_id', 'todos']
    }
  },
  {
    name: 'bloom_post_progress',
    description: 'Post a progress update to the operator conference channel so the user can see what you are building in real time.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Progress update message (supports markdown)' },
        org_id: { type: 'string', description: 'Organization ID' }
      },
      required: ['message', 'org_id']
    }
  }
];

// ── TOOL EXECUTOR ─────────────────────────────────────────────────────────────
async function executeTool(name, args) {
  const supabase = getSupabase();

  // ── get_layout_blueprint ───────────────────────────────────────────────────
  if (name === 'get_layout_blueprint') {
    const { style_id } = args;
    const blueprint = LAYOUT_BLUEPRINTS[style_id];

    if (!blueprint) {
      throw new Error(`Unknown style_id: ${style_id}. Valid options: ${ALL_STYLES.join(', ')}`);
    }

    return {
      style_id,
      hero_type: blueprint.hero,
      description: blueprint.description,
      section_order: blueprint.structure,
      html_skeleton: blueprint.skeleton.trim(),
      usage_note: 'Replace all {{PLACEHOLDER}} tokens with real content. Use brand kit CSS variables (--color-primary, --color-secondary, --color-accent, --color-dark, --color-light, --font-heading, --font-body) throughout. Connect all forms to /api/forms/submit.'
    };
  }

  // ── bloom_clarify ──────────────────────────────────────────────────────────
  if (name === 'bloom_clarify') {
    const { question, context: ctx, options, allow_free_text = true, session_id } = args;

    // Write the clarification request to Supabase
    const { data: clarify, error } = await supabase
      .from('managed_clarify_queue')
      .insert({
        session_id,
        question,
        context: ctx || null,
        options: JSON.stringify(options),
        allow_free_text,
        response: null,
        responded_at: null
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to post clarification: ${error.message}`);

    // Also post to messages table so the dashboard chat shows it as an interactive message
    await supabase.from('messages').insert({
      session_id,
      role: 'assistant',
      content: question,
      metadata: {
        type: 'clarify',
        clarify_id: clarify.id,
        context: ctx,
        options,
        allow_free_text,
        source: 'managed-website-agent'
      }
    });

    // Long-poll for user response (max 5 minutes)
    const maxWaitMs = 5 * 60 * 1000;
    const pollIntervalMs = 2000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));

      const { data: updated } = await supabase
        .from('managed_clarify_queue')
        .select('response, responded_at')
        .eq('id', clarify.id)
        .single();

      if (updated?.response !== null && updated?.response !== undefined) {
        return { answer: updated.response, clarify_id: clarify.id };
      }
    }

    throw new Error('User did not respond to clarification within 5 minutes. Build paused.');
  }

  // ── task_progress ──────────────────────────────────────────────────────────
  if (name === 'task_progress') {
    const { session_id, org_id, todos } = args;

    const { error } = await supabase
      .from('managed_task_progress')
      .upsert({
        session_id,
        org_id: org_id || null,
        todos,
        updated_at: new Date().toISOString()
      }, { onConflict: 'session_id' });

    if (error) throw new Error(`Failed to update task progress: ${error.message}`);

    // Also broadcast via SSE if available
    try {
      const { broadcastToClients } = await import('./events.js');
      broadcastToClients?.('task_progress_update', { session_id, todos });
    } catch { /* non-fatal */ }

    return { success: true, session_id, step_count: todos.length };
  }

  // ── bloom_post_progress ────────────────────────────────────────────────────
  if (name === 'bloom_post_progress') {
    const { message, org_id } = args;

    const { error } = await supabase
      .from('conference_messages')
      .insert({
        org_id,
        role: 'assistant',
        content: message,
        sender_type: 'claude',
        message_type: 'update',
        metadata: { sender_label: 'BLOOM Website Builder', source: 'managed-website-agent' }
      });

    if (error) throw new Error(`Failed to post progress: ${error.message}`);
    return { success: true };
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── MCP ROUTE ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body || {};

  try {
    if (method === 'initialize') {
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'bloom-website-mcp', version: '1.0.0' }
        }
      });
    }

    if (method === 'notifications/initialized') return res.status(204).end();

    if (method === 'tools/list') {
      return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    }

    if (method === 'tools/call') {
      const { name, arguments: toolArgs } = params || {};
      const result = await executeTool(name, toolArgs || {});
      return res.json({
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      });
    }

    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });

  } catch (err) {
    logger.error('Website MCP tool error', { error: err.message });
    return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
});

router.get('/', (req, res) => {
  const bloomUrl = process.env.BLOOM_APP_URL || 'https://autonomous-sarah-rodriguez-production.up.railway.app';
  res.json({
    name: 'bloom-website-mcp',
    version: '1.0.0',
    status: 'ok',
    tools: TOOLS.map(t => t.name),
    connector_url: `${bloomUrl}/website-mcp`,
    note: 'Used by BLOOM Managed Website Agent. Not a Cowork entry point — entry is the dashboard chat.'
  });
});

export default router;
