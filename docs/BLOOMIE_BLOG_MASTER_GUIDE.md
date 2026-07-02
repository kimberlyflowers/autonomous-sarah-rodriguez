# Bloomie Blog Master Guide

This is the internal reference for creating Bloomie Staffing blog posts consistently.

## Reference Files

- Visual PDF: `docs/blog-master/bloomie-perfect-master-blog.pdf`
- Interactive HTML with hover notes: `docs/blog-master/bloomie-perfect-master-blog.html`
- Desktop preview: `docs/blog-master/bloomie-perfect-master-blog-preview.png`
- Hover-note preview: `docs/blog-master/bloomie-perfect-master-blog-hover-note.png`
- Mobile preview: `docs/blog-master/bloomie-perfect-master-blog-mobile.png`
- Regenerator script: `scripts/create_bloomie_blog_master_reference.py`

## How Sarah Should Use This

Use the HTML/PDF as a format reference, not copy to publish. A live post should keep the same visual system and checklist, but it should not include reference-only hover notes or the internal checklist section.

Every Bloomie authority blog should:

- Answer a real question advisors or buyers are already asking on Google, Reddit, forums, sales calls, or AI search.
- Establish trust before selling.
- Use Bloomie field observations, but back core claims with credible research.
- Include visible stats or facts in the body.
- Include at least one practical example that shows the problem and fix.
- Use subtle inline source links only where facts are explained.
- Keep external source links away from the hero, podcast block, CTA, and button areas.
- Use the master nav/app nav. Do not create a new nav variant for individual posts.
- Include the Back to Blog link, 16:9 hero, podcast block, author/date row, Q&A accordion, dark CTA card, and footer.
- Verify the live `/p/...` URL, `/p/blog` index, images, nav, CTA, analytics tag, and mobile layout before marking the task complete.

## Sarah Skill Source

The live blog-writing behavior is controlled by:

`heartbeat-engine/src/skills/catalog/blog-content.md`

That skill now includes the mandatory research, examples, source-link, conversion, and visual-format rules from this guide.
