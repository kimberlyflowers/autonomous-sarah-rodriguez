// BLOOM Website Plugin — Template Registry
// 20 responsive mobile-first templates for client sites
// Each template is a function: (contentData) => fullHTML string

// ─── Shared base styles injected into every template ──────────────────────────
const BASE_CSS = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;overflow-x:hidden}
  img{max-width:100%;height:auto;display:block}
  a{color:inherit;text-decoration:none}
  button,input,select,textarea{font:inherit;font-size:16px}
  button{cursor:pointer;border:none;background:none}

  /* NAV */
  .nav{position:sticky;top:0;z-index:100;width:100%;background:var(--nav-bg,#fff);box-shadow:0 1px 6px rgba(0,0,0,.12)}
  .nav-inner{display:flex;align-items:center;justify-content:space-between;padding:0 20px;height:60px;max-width:1200px;margin:0 auto}
  .nav-logo{font-weight:700;font-size:1.2rem;color:var(--primary,#2563eb)}
  .nav-links{display:flex;gap:28px;align-items:center}
  .nav-links a{font-size:.95rem;font-weight:500;color:var(--nav-text,#1a1a1a);min-height:44px;display:flex;align-items:center;padding:0 4px;transition:color .2s}
  .nav-links a:hover{color:var(--primary,#2563eb)}
  .nav-cta{background:var(--primary,#2563eb);color:#fff!important;padding:10px 20px;border-radius:6px;font-weight:600}
  .hamburger{display:none;flex-direction:column;gap:5px;padding:8px;min-width:44px;min-height:44px;align-items:center;justify-content:center}
  .hamburger span{display:block;width:22px;height:2px;background:var(--nav-text,#1a1a1a);transition:.3s}
  .mobile-menu{display:none;flex-direction:column;background:var(--nav-bg,#fff);border-top:1px solid #eee;padding:12px 20px 20px}
  .mobile-menu a{padding:12px 0;font-size:1rem;font-weight:500;color:var(--nav-text,#1a1a1a);border-bottom:1px solid #f0f0f0;min-height:44px;display:flex;align-items:center}
  .mobile-menu a:last-child{border-bottom:none}
  .mobile-menu.open{display:flex}

  /* SECTIONS */
  .section{padding:64px 20px}
  .section-sm{padding:40px 20px}
  .container{max-width:1100px;margin:0 auto;width:100%}
  .text-center{text-align:center}

  /* HERO */
  .hero{padding:80px 20px 60px;text-align:center}
  .hero h1{font-size:clamp(2rem,5vw,3.5rem);font-weight:800;line-height:1.15;margin-bottom:20px}
  .hero p{font-size:clamp(1rem,2.5vw,1.25rem);color:#555;max-width:640px;margin:0 auto 32px}

  /* BUTTONS */
  .btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 28px;border-radius:8px;font-weight:600;font-size:1rem;transition:.2s;text-align:center}
  .btn-primary{background:var(--primary,#2563eb);color:#fff}
  .btn-primary:hover{filter:brightness(1.1)}
  .btn-secondary{background:transparent;color:var(--primary,#2563eb);border:2px solid var(--primary,#2563eb)}
  .btn-secondary:hover{background:var(--primary,#2563eb);color:#fff}
  .btn-group{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:8px}

  /* CARDS */
  .cards{display:grid;gap:24px;grid-template-columns:1fr}
  .card{background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .card-icon{font-size:2rem;margin-bottom:12px}
  .card h3{font-size:1.15rem;font-weight:700;margin-bottom:8px}
  .card p{color:#555;font-size:.95rem}

  /* FORM */
  .form{display:flex;flex-direction:column;gap:16px;max-width:480px;margin:0 auto}
  .form input,.form textarea,.form select{width:100%;padding:14px 16px;border:2px solid #e2e8f0;border-radius:8px;font-size:1rem;transition:.2s}
  .form input:focus,.form textarea:focus,.form select:focus{outline:none;border-color:var(--primary,#2563eb)}
  .form textarea{min-height:120px;resize:vertical}
  .form button[type=submit]{min-height:52px;width:100%;font-size:1.05rem}

  /* FOOTER */
  .footer{background:var(--footer-bg,#1a1a1a);color:#ccc;padding:40px 20px;text-align:center;font-size:.9rem}
  .footer a{color:#aaa;transition:color .2s}
  .footer a:hover{color:#fff}
  .footer-links{display:flex;flex-wrap:wrap;gap:20px;justify-content:center;margin-bottom:20px}

  /* BADGE */
  .badge{display:inline-block;background:var(--badge-bg,#eff6ff);color:var(--primary,#2563eb);border-radius:20px;padding:4px 14px;font-size:.8rem;font-weight:600;margin-bottom:12px}

  /* TESTIMONIALS */
  .testimonial{background:#f8faff;border-left:4px solid var(--primary,#2563eb);border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:20px}
  .testimonial p{font-style:italic;color:#333;margin-bottom:10px}
  .testimonial-author{font-weight:700;font-size:.9rem;color:var(--primary,#2563eb)}

  /* STATS */
  .stats{display:grid;gap:24px;grid-template-columns:1fr}
  .stat{text-align:center;padding:24px}
  .stat-number{font-size:2.5rem;font-weight:800;color:var(--primary,#2563eb)}
  .stat-label{font-size:.9rem;color:#555;margin-top:4px}

  /* PRICING */
  .pricing-grid{display:grid;gap:24px;grid-template-columns:1fr}
  .pricing-card{background:#fff;border:2px solid #e2e8f0;border-radius:16px;padding:32px 24px;text-align:center}
  .pricing-card.featured{border-color:var(--primary,#2563eb);position:relative}
  .pricing-card .price{font-size:2.5rem;font-weight:800;color:var(--primary,#2563eb)}
  .pricing-card .price span{font-size:1rem;font-weight:400;color:#888}
  .pricing-card ul{list-style:none;margin:20px 0;text-align:left;display:flex;flex-direction:column;gap:10px}
  .pricing-card ul li::before{content:'✓ ';color:var(--primary,#2563eb);font-weight:700}

  /* RESPONSIVE BREAKPOINTS */
  @media(min-width:768px){
    .cards{grid-template-columns:repeat(2,1fr)}
    .stats{grid-template-columns:repeat(3,1fr)}
    .pricing-grid{grid-template-columns:repeat(2,1fr)}
    .hero{padding:100px 40px 80px}
    .section{padding:80px 40px}
  }
  @media(min-width:1024px){
    .cards{grid-template-columns:repeat(3,1fr)}
    .pricing-grid{grid-template-columns:repeat(3,1fr)}
  }
  @media(max-width:767px){
    .nav-links{display:none}
    .hamburger{display:flex}
  }
`;

// ─── Shared hamburger nav script ───────────────────────────────────────────────
const NAV_SCRIPT = `
  <script>
    (function(){
      var btn = document.getElementById('ham');
      var menu = document.getElementById('mobile-menu');
      if(btn && menu){
        btn.addEventListener('click', function(){
          menu.classList.toggle('open');
          btn.setAttribute('aria-expanded', menu.classList.contains('open'));
        });
        document.addEventListener('click', function(e){
          if(!btn.contains(e.target) && !menu.contains(e.target)){
            menu.classList.remove('open');
          }
        });
      }
    })();
  </script>
`;

// ─── Helper: build full HTML page ─────────────────────────────────────────────
function buildPage({ title, description, themeColor, navBg, navText, footerBg, extraCss = '', body, logo }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escHtml(description || '')}">
<title>${escHtml(title || 'Welcome')}</title>
<style>
:root{
  --primary:${themeColor || '#2563eb'};
  --nav-bg:${navBg || '#fff'};
  --nav-text:${navText || '#1a1a1a'};
  --footer-bg:${footerBg || '#1a1a1a'};
}
${BASE_CSS}
${extraCss}
</style>
</head>
<body>
${body}
${NAV_SCRIPT}
</body>
</html>`;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Shared nav builder ────────────────────────────────────────────────────────
function buildNav(d, links = [], ctaLabel = 'Contact Us', ctaHref = '#contact') {
  const logo = d.businessName || d.siteName || 'Business';
  const linkItems = links.map(l => `<a href="${l.href}">${escHtml(l.label)}</a>`).join('');
  const mobileItems = links.map(l => `<a href="${l.href}">${escHtml(l.label)}</a>`).join('');
  return `
<nav class="nav" role="navigation" aria-label="Main navigation">
  <div class="nav-inner">
    <a class="nav-logo" href="/">${escHtml(logo)}</a>
    <div class="nav-links">
      ${linkItems}
      <a href="${ctaHref}" class="btn btn-primary nav-cta">${escHtml(ctaLabel)}</a>
    </div>
    <button class="hamburger" id="ham" aria-label="Open menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div class="mobile-menu" id="mobile-menu" role="menu">
    ${mobileItems}
    <a href="${ctaHref}" style="margin-top:8px;text-align:center" class="btn btn-primary">${escHtml(ctaLabel)}</a>
  </div>
</nav>`;
}

// ─── Shared footer ─────────────────────────────────────────────────────────────
function buildFooter(d) {
  const biz = escHtml(d.businessName || d.siteName || 'Business');
  const year = new Date().getFullYear();
  return `
<footer class="footer">
  <div class="footer-links">
    ${(d.footerLinks || []).map(l => `<a href="${l.href}">${escHtml(l.label)}</a>`).join('')}
  </div>
  <p>&copy; ${year} ${biz}. All rights reserved.</p>
  ${d.footerNote ? `<p style="margin-top:8px;font-size:.8rem;color:#666">${escHtml(d.footerNote)}</p>` : ''}
</footer>`;
}

// ─── Shared lead capture form ──────────────────────────────────────────────────
function buildLeadForm(d, orgSlug, heading = 'Get In Touch', subheading = '') {
  const endpoint = `/api/capture-lead`;
  return `
<section class="section" id="contact" style="background:var(--primary);color:#fff">
  <div class="container text-center">
    <h2 style="font-size:clamp(1.5rem,3vw,2.2rem);font-weight:800;margin-bottom:12px">${escHtml(heading)}</h2>
    ${subheading ? `<p style="margin-bottom:32px;opacity:.85">${escHtml(subheading)}</p>` : ''}
    <form class="form" id="lead-form" onsubmit="submitLead(event,'${escHtml(orgSlug)}')">
      <input type="text" name="name" placeholder="Your Name" required>
      <input type="email" name="email" placeholder="Email Address" required>
      <input type="tel" name="phone" placeholder="Phone Number">
      <textarea name="message" placeholder="How can we help you?"></textarea>
      <button type="submit" class="btn btn-secondary" style="color:#fff;border-color:#fff">Send Message</button>
      <p id="form-msg" style="font-size:.9rem;min-height:20px"></p>
    </form>
  </div>
</section>
<script>
async function submitLead(e, slug){
  e.preventDefault();
  var msg = document.getElementById('form-msg');
  var form = e.target;
  msg.textContent = 'Sending...';
  try {
    var data = Object.fromEntries(new FormData(form).entries());
    data.orgSlug = slug;
    var res = await fetch('/api/capture-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(res.ok){ msg.textContent = 'Message sent! We\\'ll be in touch soon.'; form.reset(); }
    else { msg.textContent = 'Something went wrong. Please try again.'; }
  } catch(err){ msg.textContent = 'Network error. Please try again.'; }
}
</script>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE DEFINITIONS
// Each export: { id, name, sections, render(contentData) -> HTML }
// ═══════════════════════════════════════════════════════════════════════════════

// ── 01 Service Business ────────────────────────────────────────────────────────
export const template01 = {
  id: '01',
  name: 'Service Business',
  sections: ['hero','services','about','testimonials','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#services',label:'Services'},
      {href:'#about',label:'About'},
      {href:'#testimonials',label:'Reviews'},
    ]);
    const services = (d.services || ['Consultation','Implementation','Support']).map(s =>
      `<div class="card"><div class="card-icon">⚙️</div><h3>${escHtml(s)}</h3><p>${escHtml(d.serviceDesc || 'Professional service tailored to your needs.')}</p></div>`
    ).join('');
    return buildPage({
      title: d.businessName || 'Service Business',
      description: d.tagline || 'Professional services you can trust',
      themeColor: d.themeColor || '#2563eb',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)">
  <div class="container">
    ${d.badge ? `<span class="badge">${escHtml(d.badge)}</span>` : ''}
    <h1>${escHtml(d.headline || d.businessName || 'Expert Services You Can Trust')}</h1>
    <p>${escHtml(d.tagline || 'We deliver results that matter to your business.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn btn-primary">${escHtml(d.ctaLabel || 'Get a Free Quote')}</a>
      <a href="#services" class="btn btn-secondary">Our Services</a>
    </div>
  </div>
</section>
<section class="section" id="services">
  <div class="container">
    <h2 class="text-center" style="font-size:2rem;font-weight:800;margin-bottom:40px">${escHtml(d.servicesHeading || 'What We Offer')}</h2>
    <div class="cards">${services}</div>
  </div>
</section>
${d.stats ? `<section class="section-sm" style="background:#f8faff"><div class="container"><div class="stats">
  ${d.stats.map(s=>`<div class="stat"><div class="stat-number">${escHtml(s.value)}</div><div class="stat-label">${escHtml(s.label)}</div></div>`).join('')}
</div></div></section>` : ''}
<section class="section" id="about" style="background:#f8faff">
  <div class="container" style="max-width:780px">
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:16px">${escHtml(d.aboutHeading || 'About Us')}</h2>
    <p style="font-size:1.05rem;color:#444">${escHtml(d.about || 'We are a dedicated team committed to delivering excellent results.')}</p>
  </div>
</section>
${d.testimonials ? `<section class="section" id="testimonials"><div class="container"><h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">What Clients Say</h2>
  ${d.testimonials.map(t=>`<div class="testimonial"><p>"${escHtml(t.quote)}"</p><div class="testimonial-author">— ${escHtml(t.author)}</div></div>`).join('')}
</div></section>` : ''}
${buildLeadForm(d, d.orgSlug || '', 'Request a Free Quote', d.contactSubheading || '')}
${buildFooter(d)}`
    });
  }
};

// ── 02 Real Estate Agent ───────────────────────────────────────────────────────
export const template02 = {
  id: '02',
  name: 'Real Estate Agent',
  sections: ['hero','listings','about','testimonials','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#listings',label:'Listings'},
      {href:'#about',label:'About'},
      {href:'#contact',label:'Contact'},
    ], 'Book a Showing', '#contact');
    return buildPage({
      title: d.agentName || d.businessName || 'Real Estate',
      description: d.tagline || 'Find your dream home',
      themeColor: d.themeColor || '#16a34a',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)">
  <div class="container">
    <span class="badge">Licensed Real Estate Professional</span>
    <h1>${escHtml(d.headline || 'Find Your Perfect Home')}</h1>
    <p>${escHtml(d.tagline || 'Expert guidance through every step of your real estate journey.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn btn-primary">Schedule a Consultation</a>
      <a href="#listings" class="btn btn-secondary">View Listings</a>
    </div>
  </div>
</section>
${d.stats ? `<section class="section-sm" style="background:#fff"><div class="container"><div class="stats">
  ${d.stats.map(s=>`<div class="stat"><div class="stat-number">${escHtml(s.value)}</div><div class="stat-label">${escHtml(s.label)}</div></div>`).join('')}
</div></div></section>` : `<section class="section-sm" style="background:#fff"><div class="container"><div class="stats">
  <div class="stat"><div class="stat-number">200+</div><div class="stat-label">Homes Sold</div></div>
  <div class="stat"><div class="stat-number">98%</div><div class="stat-label">Client Satisfaction</div></div>
  <div class="stat"><div class="stat-number">15yr</div><div class="stat-label">Experience</div></div>
</div></div></section>`}
<section class="section" id="listings" style="background:#f8faff">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Featured Listings</h2>
    <div class="cards">
      ${(d.listings || [{title:'Beautiful 4BR Home',price:'$485,000',desc:'Spacious family home in quiet neighborhood.'},{title:'Modern Downtown Condo',price:'$329,000',desc:'Walking distance to shops and restaurants.'},{title:'Charming Starter Home',price:'$245,000',desc:'Perfect for first-time buyers.'}]).map(l=>
        `<div class="card"><h3>${escHtml(l.title)}</h3><p style="font-size:1.3rem;font-weight:800;color:var(--primary);margin:8px 0">${escHtml(l.price)}</p><p>${escHtml(l.desc)}</p><a href="#contact" class="btn btn-primary" style="margin-top:16px;width:100%">Inquire</a></div>`
      ).join('')}
    </div>
  </div>
</section>
<section class="section" id="about">
  <div class="container" style="max-width:780px">
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:16px">About ${escHtml(d.agentName || d.businessName || 'Your Agent')}</h2>
    <p style="font-size:1.05rem;color:#444">${escHtml(d.about || 'A dedicated real estate professional committed to helping you find the perfect property.')}</p>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'Ready to Find Your Home?', 'Contact me today for a free consultation.')}
${buildFooter(d)}`
    });
  }
};

// ── 03 Financial Advisor ───────────────────────────────────────────────────────
export const template03 = {
  id: '03',
  name: 'Financial Advisor',
  sections: ['hero','services','process','testimonials','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#services',label:'Services'},
      {href:'#process',label:'Our Process'},
      {href:'#contact',label:'Contact'},
    ], 'Free Consultation', '#contact');
    return buildPage({
      title: d.businessName || 'Financial Advisor',
      description: d.tagline || 'Expert financial guidance for your future',
      themeColor: d.themeColor || '#1e40af',
      extraCss: `.process-steps{counter-reset:step;display:grid;gap:24px}.process-step{display:flex;gap:16px;align-items:flex-start}.step-num{background:var(--primary);color:#fff;border-radius:50%;width:40px;height:40px;min-width:40px;display:flex;align-items:center;justify-content:center;font-weight:800}`,
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#eff6ff 0%,#e0e7ff 100%)">
  <div class="container">
    <span class="badge">CFP® Certified Financial Planner</span>
    <h1>${escHtml(d.headline || 'Build Wealth. Protect Your Future.')}</h1>
    <p>${escHtml(d.tagline || 'Personalized financial strategies that help you achieve your goals.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn btn-primary">Book Free Consultation</a>
      <a href="#services" class="btn btn-secondary">Our Services</a>
    </div>
  </div>
</section>
<section class="section" id="services">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Financial Services</h2>
    <div class="cards">
      ${(d.services || ['Retirement Planning','Investment Management','Tax Strategy','Estate Planning','Insurance Review','Debt Management']).map((s,i)=>
        `<div class="card"><div class="card-icon">${['🏦','📈','💰','📋','🛡️','💳'][i]||'💼'}</div><h3>${escHtml(s)}</h3><p>${escHtml(d.serviceDesc || 'Tailored financial solutions for your unique situation.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
<section class="section" id="process" style="background:#f8faff">
  <div class="container" style="max-width:780px">
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Our Process</h2>
    <div class="process-steps">
      ${(d.process || ['Discover your goals','Analyze your finances','Build your plan','Implement & monitor']).map((step,i)=>
        `<div class="process-step"><div class="step-num">${i+1}</div><div><h3 style="font-size:1.1rem;font-weight:700;margin-bottom:6px">${escHtml(step)}</h3></div></div>`
      ).join('')}
    </div>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'Start Your Financial Journey', 'Schedule a complimentary consultation today.')}
${buildFooter(d)}`
    });
  }
};

// ── 04 School / Nonprofit ──────────────────────────────────────────────────────
export const template04 = {
  id: '04',
  name: 'School / Nonprofit',
  sections: ['hero','mission','programs','team','donate','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#mission',label:'Mission'},
      {href:'#programs',label:'Programs'},
      {href:'#contact',label:'Contact'},
    ], 'Donate', '#donate');
    return buildPage({
      title: d.businessName || d.orgName || 'Our Organization',
      description: d.tagline || 'Making a difference in our community',
      themeColor: d.themeColor || '#7c3aed',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)">
  <div class="container">
    <h1>${escHtml(d.headline || d.businessName || 'Making a Difference')}</h1>
    <p>${escHtml(d.tagline || 'Empowering our community through education, support, and connection.')}</p>
    <div class="btn-group">
      <a href="#donate" class="btn btn-primary">Support Our Mission</a>
      <a href="#programs" class="btn btn-secondary">Our Programs</a>
    </div>
  </div>
</section>
<section class="section" id="mission" style="background:#f8faff">
  <div class="container" style="max-width:780px;text-align:center">
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:16px">Our Mission</h2>
    <p style="font-size:1.1rem;color:#444;line-height:1.8">${escHtml(d.mission || 'We are committed to serving our community and creating lasting positive change for those we serve.')}</p>
  </div>
</section>
<section class="section" id="programs">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Our Programs</h2>
    <div class="cards">
      ${(d.programs || ['Education','Community Support','Youth Development']).map(p=>
        `<div class="card"><div class="card-icon">🌟</div><h3>${escHtml(p)}</h3><p>${escHtml(d.programDesc || 'Helping those we serve thrive and grow.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
<section class="section" id="donate" style="background:var(--primary);color:#fff;text-align:center">
  <div class="container">
    <h2 style="font-size:2rem;font-weight:800;margin-bottom:12px">Support Our Work</h2>
    <p style="opacity:.85;margin-bottom:28px">${escHtml(d.donateText || 'Your generous donation helps us continue our mission and serve more people in need.')}</p>
    <a href="${d.donateUrl || '#contact'}" class="btn" style="background:#fff;color:var(--primary);font-weight:700;font-size:1.1rem">Donate Now</a>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'Get Involved', 'Contact us to learn more or volunteer.')}
${buildFooter(d)}`
    });
  }
};

// ── 05 Personal Brand ─────────────────────────────────────────────────────────
export const template05 = {
  id: '05',
  name: 'Personal Brand',
  sections: ['hero','about','offerings','testimonials','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#about',label:'About'},
      {href:'#offerings',label:'Work With Me'},
      {href:'#contact',label:'Contact'},
    ], 'Let\'s Connect', '#contact');
    return buildPage({
      title: d.name || d.businessName || 'Personal Brand',
      description: d.tagline || 'Speaker, coach, and thought leader',
      themeColor: d.themeColor || '#db2777',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#fdf2f8 0%,#fce7f3 100%)">
  <div class="container">
    <span class="badge">${escHtml(d.title || 'Speaker · Author · Coach')}</span>
    <h1>${escHtml(d.headline || `Hi, I'm ${d.name || 'Your Name'}`)}</h1>
    <p>${escHtml(d.tagline || 'I help people unlock their potential and build the life they deserve.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn btn-primary">Work With Me</a>
      <a href="#about" class="btn btn-secondary">Learn More</a>
    </div>
  </div>
</section>
<section class="section" id="about" style="background:#fff">
  <div class="container" style="max-width:780px">
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:16px">About Me</h2>
    <p style="font-size:1.05rem;color:#444;line-height:1.8">${escHtml(d.about || 'A passionate professional dedicated to helping others achieve their goals and live fulfilling lives.')}</p>
  </div>
</section>
<section class="section" id="offerings" style="background:#fdf2f8">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Work With Me</h2>
    <div class="cards">
      ${(d.offerings || ['1:1 Coaching','Speaking','Online Course']).map(o=>
        `<div class="card"><div class="card-icon">✨</div><h3>${escHtml(o)}</h3><p>${escHtml(d.offeringDesc || 'Personalized support to help you reach your goals faster.')}</p><a href="#contact" class="btn btn-primary" style="margin-top:16px;width:100%">Learn More</a></div>`
      ).join('')}
    </div>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', "Let's Work Together", d.contactSubheading || "I'd love to hear from you.")}
${buildFooter(d)}`
    });
  }
};

// ── 06 Lead Gen Simple ────────────────────────────────────────────────────────
export const template06 = {
  id: '06',
  name: 'Lead Gen Simple',
  sections: ['hero','benefits','social-proof','form'],
  render(d) {
    return buildPage({
      title: d.headline || d.businessName || 'Get Started',
      description: d.subheadline || 'Sign up today',
      themeColor: d.themeColor || '#2563eb',
      extraCss: `.lead-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)}
.lead-box{background:#fff;border-radius:16px;padding:40px 32px;box-shadow:0 8px 40px rgba(0,0,0,.12);width:100%;max-width:480px}
.benefits-list{list-style:none;display:flex;flex-direction:column;gap:12px;margin:20px 0}
.benefits-list li::before{content:'✓ ';color:var(--primary);font-weight:800}`,
      body: `
<div class="lead-page">
  <div class="lead-box">
    <div class="text-center" style="margin-bottom:28px">
      <h1 style="font-size:clamp(1.5rem,4vw,2rem);font-weight:800;margin-bottom:12px">${escHtml(d.headline || 'Get Your Free Guide')}</h1>
      <p style="color:#555">${escHtml(d.subheadline || 'Enter your info below and we\'ll send it right away.')}</p>
    </div>
    ${d.benefits ? `<ul class="benefits-list">${d.benefits.map(b=>`<li>${escHtml(b)}</li>`).join('')}</ul>` : ''}
    <form class="form" id="lead-form" onsubmit="submitLead(event,'${escHtml(d.orgSlug||'')}')">
      <input type="text" name="name" placeholder="Full Name" required>
      <input type="email" name="email" placeholder="Email Address" required>
      ${d.collectPhone !== false ? `<input type="tel" name="phone" placeholder="Phone (optional)">` : ''}
      <button type="submit" class="btn btn-primary">${escHtml(d.ctaLabel || 'Send Me The Guide')}</button>
      <p id="form-msg" style="font-size:.9rem;text-align:center;min-height:20px"></p>
    </form>
    ${d.guarantee ? `<p style="font-size:.8rem;color:#888;text-align:center;margin-top:16px">🔒 ${escHtml(d.guarantee)}</p>` : `<p style="font-size:.8rem;color:#888;text-align:center;margin-top:16px">🔒 No spam. Unsubscribe anytime.</p>`}
  </div>
</div>
<script>
async function submitLead(e, slug){
  e.preventDefault();
  var msg = document.getElementById('form-msg');
  msg.textContent = 'Processing...';
  try {
    var data = Object.fromEntries(new FormData(e.target).entries());
    data.orgSlug = slug;
    var res = await fetch('/api/capture-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(res.ok){ msg.textContent = '${escHtml(d.successMsg || "Success! Check your inbox.")}'; e.target.reset(); }
    else { msg.textContent = 'Something went wrong. Please try again.'; }
  } catch(err){ msg.textContent = 'Network error. Please try again.'; }
}
</script>`
    });
  }
};

// ── 07 Product Launch ─────────────────────────────────────────────────────────
export const template07 = {
  id: '07',
  name: 'Product Launch',
  sections: ['hero','features','how-it-works','pricing','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#features',label:'Features'},
      {href:'#pricing',label:'Pricing'},
      {href:'#contact',label:'Get Access'},
    ], 'Get Early Access', '#contact');
    return buildPage({
      title: d.productName || d.businessName || 'New Product',
      description: d.tagline || 'The product you\'ve been waiting for',
      themeColor: d.themeColor || '#7c3aed',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);color:#fff">
  <div class="container">
    ${d.badge ? `<span class="badge" style="background:rgba(255,255,255,.15);color:#fff">${escHtml(d.badge)}</span>` : '<span class="badge" style="background:rgba(255,255,255,.15);color:#fff">🚀 Now Available</span>'}
    <h1 style="color:#fff">${escHtml(d.headline || d.productName || 'Introducing Something Amazing')}</h1>
    <p style="color:rgba(255,255,255,.8)">${escHtml(d.tagline || 'The product that changes everything.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn" style="background:#fff;color:var(--primary)">${escHtml(d.ctaLabel || 'Get Early Access')}</a>
      <a href="#features" class="btn" style="color:#fff;border:2px solid rgba(255,255,255,.5)">See Features</a>
    </div>
  </div>
</section>
<section class="section" id="features">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Features</h2>
    <div class="cards">
      ${(d.features || ['Powerful Feature 1','Powerful Feature 2','Powerful Feature 3']).map(f=>
        `<div class="card"><div class="card-icon">⚡</div><h3>${escHtml(f)}</h3><p>${escHtml(d.featureDesc || 'Built to save you time and deliver results.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
${d.pricing ? `<section class="section" id="pricing" style="background:#f8faff"><div class="container">
  <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Simple Pricing</h2>
  <div class="pricing-grid">
    ${d.pricing.map((p,i)=>`<div class="pricing-card ${i===1?'featured':''}">
      <h3 style="font-weight:700;margin-bottom:8px">${escHtml(p.name)}</h3>
      <div class="price">${escHtml(p.price)}<span>/${escHtml(p.period||'mo')}</span></div>
      <ul>${(p.features||[]).map(f=>`<li>${escHtml(f)}</li>`).join('')}</ul>
      <a href="#contact" class="btn btn-primary" style="width:100%">Get Started</a>
    </div>`).join('')}
  </div>
</div></section>` : ''}
${buildLeadForm(d, d.orgSlug || '', d.ctaLabel || 'Get Early Access', d.contactSubheading || 'Join the waitlist and be first in line.')}
${buildFooter(d)}`
    });
  }
};

// ── 08 Coaching / Consulting ──────────────────────────────────────────────────
export const template08 = {
  id: '08',
  name: 'Coaching / Consulting',
  sections: ['hero','results','programs','process','testimonials','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#programs',label:'Programs'},
      {href:'#process',label:'Process'},
      {href:'#testimonials',label:'Results'},
    ], 'Apply Now', '#contact');
    return buildPage({
      title: d.businessName || d.coachName || 'Coaching & Consulting',
      description: d.tagline || 'Transform your life and business',
      themeColor: d.themeColor || '#d97706',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)">
  <div class="container">
    <span class="badge">${escHtml(d.credential || 'Certified Coach & Consultant')}</span>
    <h1>${escHtml(d.headline || 'Transform Your Life & Business')}</h1>
    <p>${escHtml(d.tagline || 'Stop playing small. Start achieving the results you deserve.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn btn-primary">Apply Now</a>
      <a href="#programs" class="btn btn-secondary">See Programs</a>
    </div>
  </div>
</section>
${d.stats ? `<section class="section-sm" style="background:#fff"><div class="container"><div class="stats">
  ${d.stats.map(s=>`<div class="stat"><div class="stat-number">${escHtml(s.value)}</div><div class="stat-label">${escHtml(s.label)}</div></div>`).join('')}
</div></div></section>` : ''}
<section class="section" id="programs" style="background:#f8faff">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Programs</h2>
    <div class="cards">
      ${(d.programs || ['1:1 Coaching','Group Mastermind','VIP Intensive']).map(p=>
        `<div class="card"><div class="card-icon">🎯</div><h3>${escHtml(p)}</h3><p>${escHtml(d.programDesc || 'Customized to your specific goals and challenges.')}</p><a href="#contact" class="btn btn-primary" style="margin-top:16px;width:100%">Apply</a></div>`
      ).join('')}
    </div>
  </div>
</section>
${d.testimonials ? `<section class="section" id="testimonials"><div class="container"><h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Client Results</h2>
  ${d.testimonials.map(t=>`<div class="testimonial"><p>"${escHtml(t.quote)}"</p><div class="testimonial-author">— ${escHtml(t.author)}</div></div>`).join('')}
</div></section>` : ''}
${buildLeadForm(d, d.orgSlug || '', 'Ready to Transform?', 'Apply for a free strategy session.')}
${buildFooter(d)}`
    });
  }
};

// ── 09 Restaurant / Food ──────────────────────────────────────────────────────
export const template09 = {
  id: '09',
  name: 'Restaurant / Food',
  sections: ['hero','menu','about','hours','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#menu',label:'Menu'},
      {href:'#about',label:'About'},
      {href:'#hours',label:'Hours'},
    ], 'Reserve a Table', '#contact');
    return buildPage({
      title: d.businessName || 'Restaurant',
      description: d.tagline || 'Delicious food, unforgettable experience',
      themeColor: d.themeColor || '#dc2626',
      extraCss: `.menu-item{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 0;border-bottom:1px solid #f0f0f0;gap:12px}.menu-price{font-weight:700;color:var(--primary);white-space:nowrap}`,
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#450a0a 0%,#7f1d1d 100%);color:#fff">
  <div class="container">
    <h1 style="color:#fff">${escHtml(d.headline || d.businessName || 'Authentic Flavors')}</h1>
    <p style="color:rgba(255,255,255,.8)">${escHtml(d.tagline || 'Made with love, served with passion.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn" style="background:#fff;color:var(--primary)">Reserve a Table</a>
      <a href="#menu" class="btn" style="color:#fff;border:2px solid rgba(255,255,255,.5)">View Menu</a>
    </div>
  </div>
</section>
<section class="section" id="menu">
  <div class="container" style="max-width:700px">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Our Menu</h2>
    ${(d.menuCategories || [{name:'Appetizers',items:[{name:'House Salad',desc:'Fresh greens, tomatoes, house dressing',price:'$9'},{name:'Soup of the Day',desc:'Ask your server',price:'$7'}]},{name:'Entrees',items:[{name:'Grilled Salmon',desc:'Seasonal vegetables, lemon butter',price:'$24'},{name:'Pasta Primavera',desc:'Fresh vegetables, marinara',price:'$18'}]}]).map(cat=>
      `<div style="margin-bottom:32px"><h3 style="font-size:1.2rem;font-weight:800;color:var(--primary);margin-bottom:16px;text-transform:uppercase;letter-spacing:.05em">${escHtml(cat.name)}</h3>
      ${cat.items.map(item=>`<div class="menu-item"><div><strong>${escHtml(item.name)}</strong><p style="font-size:.9rem;color:#666;margin-top:4px">${escHtml(item.desc||'')}</p></div><span class="menu-price">${escHtml(item.price)}</span></div>`).join('')}</div>`
    ).join('')}
  </div>
</section>
<section class="section" id="hours" style="background:#f8faff">
  <div class="container text-center" style="max-width:480px">
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:24px">Hours & Location</h2>
    ${(d.hours || ['Mon–Thu: 11am – 9pm','Fri–Sat: 11am – 10pm','Sunday: Closed']).map(h=>`<p style="padding:8px 0;border-bottom:1px solid #eee">${escHtml(h)}</p>`).join('')}
    ${d.address ? `<p style="margin-top:20px;color:#555">📍 ${escHtml(d.address)}</p>` : ''}
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'Reserve Your Table', 'We look forward to serving you.')}
${buildFooter(d)}`
    });
  }
};

// ── 10 Health / Wellness ──────────────────────────────────────────────────────
export const template10 = {
  id: '10',
  name: 'Health / Wellness',
  sections: ['hero','services','approach','testimonials','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#services',label:'Services'},
      {href:'#approach',label:'Our Approach'},
      {href:'#contact',label:'Book Now'},
    ], 'Book a Session', '#contact');
    return buildPage({
      title: d.businessName || 'Health & Wellness',
      description: d.tagline || 'Your health is our priority',
      themeColor: d.themeColor || '#059669',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%)">
  <div class="container">
    <span class="badge">Holistic Health & Wellness</span>
    <h1>${escHtml(d.headline || 'Your Journey to Wellness Starts Here')}</h1>
    <p>${escHtml(d.tagline || 'Evidence-based, compassionate care for your mind and body.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn btn-primary">Book a Free Consultation</a>
      <a href="#services" class="btn btn-secondary">Our Services</a>
    </div>
  </div>
</section>
<section class="section" id="services">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Wellness Services</h2>
    <div class="cards">
      ${(d.services || ['Nutrition Coaching','Fitness Training','Mental Wellness','Stress Management','Sleep Optimization','Holistic Therapy']).map((s,i)=>
        `<div class="card"><div class="card-icon">${['🥗','💪','🧠','🧘','😴','🌿'][i]||'💚'}</div><h3>${escHtml(s)}</h3><p>${escHtml(d.serviceDesc || 'Personalized wellness programs designed around your unique needs.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'Start Your Wellness Journey', 'Book a free 30-minute consultation today.')}
${buildFooter(d)}`
    });
  }
};

// ── 11 Event / Conference ─────────────────────────────────────────────────────
export const template11 = {
  id: '11',
  name: 'Event / Conference',
  sections: ['hero','details','speakers','schedule','register'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#details',label:'Details'},
      {href:'#speakers',label:'Speakers'},
      {href:'#schedule',label:'Schedule'},
    ], 'Register Now', '#register');
    return buildPage({
      title: d.eventName || d.businessName || 'Event',
      description: d.tagline || 'Join us for an amazing event',
      themeColor: d.themeColor || '#7c3aed',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#2e1065 0%,#4c1d95 100%);color:#fff">
  <div class="container">
    ${d.eventDate ? `<span class="badge" style="background:rgba(255,255,255,.15);color:#fff">📅 ${escHtml(d.eventDate)}</span>` : ''}
    <h1 style="color:#fff">${escHtml(d.eventName || d.headline || 'Join the Event')}</h1>
    <p style="color:rgba(255,255,255,.8)">${escHtml(d.tagline || 'An unforgettable experience you don\'t want to miss.')}</p>
    <div class="btn-group">
      <a href="#register" class="btn" style="background:#fff;color:var(--primary)">Register Now</a>
      <a href="#speakers" class="btn" style="color:#fff;border:2px solid rgba(255,255,255,.5)">See Speakers</a>
    </div>
  </div>
</section>
<section class="section" id="details" style="background:#f8faff">
  <div class="container">
    <div class="cards">
      <div class="card"><div class="card-icon">📍</div><h3>Location</h3><p>${escHtml(d.location || 'TBD')}</p></div>
      <div class="card"><div class="card-icon">📅</div><h3>Date & Time</h3><p>${escHtml(d.eventDate || 'TBD')}</p></div>
      <div class="card"><div class="card-icon">🎟️</div><h3>Admission</h3><p>${escHtml(d.admission || 'Free / See pricing below')}</p></div>
    </div>
  </div>
</section>
${d.speakers ? `<section class="section" id="speakers"><div class="container">
  <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Featured Speakers</h2>
  <div class="cards">${d.speakers.map(s=>`<div class="card text-center"><h3>${escHtml(s.name)}</h3><p style="color:var(--primary);font-weight:600">${escHtml(s.title||'')}</p></div>`).join('')}</div>
</div></section>` : ''}
${buildLeadForm(d, d.orgSlug || '', 'Register for the Event', 'Secure your spot today — space is limited.')}
${buildFooter(d)}`
    });
  }
};

// ── 12 Law Firm ───────────────────────────────────────────────────────────────
export const template12 = {
  id: '12',
  name: 'Law Firm',
  sections: ['hero','practice-areas','attorneys','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#practice-areas',label:'Practice Areas'},
      {href:'#attorneys',label:'Attorneys'},
      {href:'#contact',label:'Contact'},
    ], 'Free Consultation', '#contact');
    return buildPage({
      title: d.firmName || d.businessName || 'Law Firm',
      description: d.tagline || 'Experienced legal representation',
      themeColor: d.themeColor || '#1e3a5f',
      navBg: '#1e3a5f',
      navText: '#fff',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff">
  <div class="container">
    <span class="badge" style="background:rgba(255,255,255,.15);color:#fff">Trusted Legal Representation</span>
    <h1 style="color:#fff">${escHtml(d.headline || d.firmName || 'Fighting For Your Rights')}</h1>
    <p style="color:rgba(255,255,255,.75)">${escHtml(d.tagline || 'Experienced attorneys dedicated to achieving the best outcome for you.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn" style="background:#fff;color:var(--primary)">Free Consultation</a>
      <a href="#practice-areas" class="btn" style="color:#fff;border:2px solid rgba(255,255,255,.4)">Practice Areas</a>
    </div>
  </div>
</section>
<section class="section" id="practice-areas">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Practice Areas</h2>
    <div class="cards">
      ${(d.practiceAreas || ['Personal Injury','Family Law','Criminal Defense','Business Law','Estate Planning','Real Estate Law']).map(a=>
        `<div class="card"><div class="card-icon">⚖️</div><h3>${escHtml(a)}</h3><p>${escHtml(d.areaDesc || 'Experienced counsel to protect your rights and interests.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
<section class="section-sm" style="background:#f8faff">
  <div class="container text-center">
    <p style="font-size:.85rem;color:#888;max-width:700px;margin:0 auto">Attorney Advertising. This website is for informational purposes only. Prior results do not guarantee a similar outcome. ${escHtml(d.disclaimer || '')}</p>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'Get a Free Consultation', 'Tell us about your legal situation — we\'re here to help.')}
${buildFooter(d)}`
    });
  }
};

// ── 13 E-Commerce Brand ───────────────────────────────────────────────────────
export const template13 = {
  id: '13',
  name: 'E-Commerce Brand',
  sections: ['hero','products','about','testimonials','cta'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#products',label:'Shop'},
      {href:'#about',label:'About'},
      {href:d.shopUrl||'#products',label:'Store'},
    ], 'Shop Now', d.shopUrl || '#products');
    return buildPage({
      title: d.brandName || d.businessName || 'Shop',
      description: d.tagline || 'Quality products you\'ll love',
      themeColor: d.themeColor || '#f59e0b',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 100%)">
  <div class="container">
    ${d.badge ? `<span class="badge">${escHtml(d.badge)}</span>` : '<span class="badge">Free Shipping on Orders $50+</span>'}
    <h1>${escHtml(d.headline || d.brandName || 'Quality You Can Feel')}</h1>
    <p>${escHtml(d.tagline || 'Thoughtfully made products for everyday life.')}</p>
    <div class="btn-group">
      <a href="${d.shopUrl||'#products'}" class="btn btn-primary">Shop Now</a>
      <a href="#about" class="btn btn-secondary">Our Story</a>
    </div>
  </div>
</section>
<section class="section" id="products">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Featured Products</h2>
    <div class="cards">
      ${(d.products || [{name:'Product One',price:'$29',desc:'Best seller.'},{name:'Product Two',price:'$49',desc:'Customer favorite.'},{name:'Product Three',price:'$39',desc:'New arrival.'}]).map(p=>
        `<div class="card text-center"><h3>${escHtml(p.name)}</h3><p style="font-size:1.3rem;font-weight:800;color:var(--primary);margin:8px 0">${escHtml(p.price)}</p><p style="color:#555;margin-bottom:16px">${escHtml(p.desc)}</p><a href="${d.shopUrl||'#'}" class="btn btn-primary" style="width:100%">Shop Now</a></div>`
      ).join('')}
    </div>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'Get Exclusive Deals', 'Join our newsletter for first access to sales and new products.')}
${buildFooter(d)}`
    });
  }
};

// ── 14 SaaS / Tech ────────────────────────────────────────────────────────────
export const template14 = {
  id: '14',
  name: 'SaaS / Tech',
  sections: ['hero','features','how-it-works','pricing','cta'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#features',label:'Features'},
      {href:'#pricing',label:'Pricing'},
      {href:'#contact',label:'Docs'},
    ], 'Start Free Trial', '#contact');
    return buildPage({
      title: d.productName || d.businessName || 'SaaS Product',
      description: d.tagline || 'Software that works for you',
      themeColor: d.themeColor || '#6366f1',
      extraCss: `.feature-check{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}.feature-check::before{content:'✓';color:var(--primary);font-weight:800;font-size:1.1rem;margin-top:2px}`,
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 100%);color:#fff">
  <div class="container">
    ${d.badge ? `<span class="badge" style="background:rgba(255,255,255,.15);color:#fff">${escHtml(d.badge)}</span>` : ''}
    <h1 style="color:#fff">${escHtml(d.headline || d.productName || 'The Tool Your Team Needs')}</h1>
    <p style="color:rgba(255,255,255,.8)">${escHtml(d.tagline || 'Automate workflows, boost productivity, and scale with confidence.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn" style="background:#fff;color:var(--primary)">${escHtml(d.ctaLabel || 'Start Free Trial')}</a>
      <a href="#features" class="btn" style="color:#fff;border:2px solid rgba(255,255,255,.4)">See Features</a>
    </div>
  </div>
</section>
<section class="section" id="features">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Everything You Need</h2>
    <div class="cards">
      ${(d.features || ['Powerful Automation','Real-time Analytics','Team Collaboration','Enterprise Security','API Access','24/7 Support']).map((f,i)=>
        `<div class="card"><div class="card-icon">${['⚡','📊','👥','🔒','🔗','🛟'][i]||'✨'}</div><h3>${escHtml(f)}</h3><p>${escHtml(d.featureDesc || 'Built to scale with your business from day one.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
${d.pricing ? `<section class="section" id="pricing" style="background:#f8faff"><div class="container">
  <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Pricing</h2>
  <div class="pricing-grid">
    ${d.pricing.map((p,i)=>`<div class="pricing-card ${i===1?'featured':''}">
      ${i===1?'<span class="badge" style="margin-bottom:12px">Most Popular</span>':''}
      <h3 style="font-weight:700;margin-bottom:8px">${escHtml(p.name)}</h3>
      <div class="price">${escHtml(p.price)}<span>/${escHtml(p.period||'mo')}</span></div>
      <ul>${(p.features||[]).map(f=>`<li>${escHtml(f)}</li>`).join('')}</ul>
      <a href="#contact" class="btn btn-primary" style="width:100%">Get Started</a>
    </div>`).join('')}
  </div>
</div></section>` : ''}
${buildLeadForm(d, d.orgSlug || '', 'Start Your Free Trial', 'No credit card required. Cancel anytime.')}
${buildFooter(d)}`
    });
  }
};

// ── 15 Medical / Dental ───────────────────────────────────────────────────────
export const template15 = {
  id: '15',
  name: 'Medical / Dental',
  sections: ['hero','services','providers','insurance','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#services',label:'Services'},
      {href:'#providers',label:'Providers'},
      {href:'#insurance',label:'Insurance'},
    ], 'Book Appointment', '#contact');
    return buildPage({
      title: d.practiceName || d.businessName || 'Medical Practice',
      description: d.tagline || 'Compassionate, expert care',
      themeColor: d.themeColor || '#0284c7',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#f0f9ff 0%,#bae6fd 100%)">
  <div class="container">
    <span class="badge">Accepting New Patients</span>
    <h1>${escHtml(d.headline || d.practiceName || 'Compassionate Care You Can Trust')}</h1>
    <p>${escHtml(d.tagline || 'Expert medical care delivered with compassion and respect.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn btn-primary">Book an Appointment</a>
      <a href="#services" class="btn btn-secondary">Our Services</a>
    </div>
  </div>
</section>
<section class="section" id="services">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Services</h2>
    <div class="cards">
      ${(d.services || ['Primary Care','Preventive Care','Chronic Disease Management','Telehealth','Lab Services','Mental Health']).map((s,i)=>
        `<div class="card"><div class="card-icon">${['🏥','🛡️','💊','💻','🔬','🧠'][i]||'🩺'}</div><h3>${escHtml(s)}</h3><p>${escHtml(d.serviceDesc || 'Delivered by experienced, compassionate providers.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
${d.insurances ? `<section class="section" id="insurance" style="background:#f8faff"><div class="container text-center">
  <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:20px">Insurance Accepted</h2>
  <p style="color:#555;margin-bottom:24px">We work with most major insurance providers.</p>
  <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center">${d.insurances.map(ins=>`<span style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 18px;font-weight:600">${escHtml(ins)}</span>`).join('')}</div>
</div></section>` : ''}
${buildLeadForm(d, d.orgSlug || '', 'Schedule an Appointment', 'We\'re here to help. Reach out today.')}
${buildFooter(d)}`
    });
  }
};

// ── 16 Home Services ──────────────────────────────────────────────────────────
export const template16 = {
  id: '16',
  name: 'Home Services',
  sections: ['hero','services','service-area','guarantee','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#services',label:'Services'},
      {href:'#service-area',label:'Service Area'},
      {href:'#contact',label:'Contact'},
    ], 'Get Free Quote', '#contact');
    return buildPage({
      title: d.businessName || 'Home Services',
      description: d.tagline || 'Professional home services you can trust',
      themeColor: d.themeColor || '#0369a1',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)">
  <div class="container">
    ${d.license ? `<span class="badge">Licensed & Insured · ${escHtml(d.license)}</span>` : '<span class="badge">Licensed & Insured</span>'}
    <h1>${escHtml(d.headline || d.businessName || 'Your Trusted Home Professionals')}</h1>
    <p>${escHtml(d.tagline || 'Fast, reliable service with a satisfaction guarantee.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn btn-primary">Get a Free Quote</a>
      <a href="#services" class="btn btn-secondary">Our Services</a>
    </div>
  </div>
</section>
<section class="section" id="services">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Services We Offer</h2>
    <div class="cards">
      ${(d.services || ['Plumbing','Electrical','HVAC','Roofing','Landscaping','Painting']).map(s=>
        `<div class="card"><div class="card-icon">🔧</div><h3>${escHtml(s)}</h3><p>${escHtml(d.serviceDesc || 'Professional, reliable service at competitive prices.')}</p><a href="#contact" class="btn btn-primary" style="margin-top:12px;width:100%">Get Quote</a></div>`
      ).join('')}
    </div>
  </div>
</section>
${d.serviceArea ? `<section class="section" id="service-area" style="background:#f8faff"><div class="container text-center">
  <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:16px">Service Area</h2>
  <p style="color:#555;margin-bottom:20px">We proudly serve the following areas:</p>
  <p style="font-size:1.05rem;color:#444">${escHtml(d.serviceArea)}</p>
</div></section>` : ''}
${buildLeadForm(d, d.orgSlug || '', 'Get Your Free Quote', 'Tell us about your project — we\'ll get back to you within 2 hours.')}
${buildFooter(d)}`
    });
  }
};

// ── 17 Ministry / Church ──────────────────────────────────────────────────────
export const template17 = {
  id: '17',
  name: 'Ministry / Church',
  sections: ['hero','about','services','events','connect'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#about',label:'About'},
      {href:'#services',label:'Service Times'},
      {href:'#events',label:'Events'},
    ], 'Plan a Visit', '#connect');
    return buildPage({
      title: d.churchName || d.businessName || 'Our Church',
      description: d.tagline || 'You are welcome here',
      themeColor: d.themeColor || '#5b21b6',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%)">
  <div class="container">
    <h1>${escHtml(d.headline || d.churchName || 'You Are Welcome Here')}</h1>
    <p>${escHtml(d.tagline || 'A community of faith, hope, and love. Everyone belongs here.')}</p>
    <div class="btn-group">
      <a href="#connect" class="btn btn-primary">Plan a Visit</a>
      <a href="#services" class="btn btn-secondary">Service Times</a>
    </div>
  </div>
</section>
<section class="section" id="services" style="background:#f8faff">
  <div class="container text-center">
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:24px">Service Times</h2>
    ${(d.serviceTimes || ['Sunday Morning: 9:00 AM & 11:00 AM','Wednesday Evening: 6:30 PM']).map(t=>
      `<p style="font-size:1.1rem;padding:12px 0;border-bottom:1px solid #eee">${escHtml(t)}</p>`
    ).join('')}
    ${d.location ? `<p style="margin-top:20px;color:#555">📍 ${escHtml(d.location)}</p>` : ''}
  </div>
</section>
<section class="section" id="about">
  <div class="container" style="max-width:780px">
    <h2 style="font-size:1.8rem;font-weight:800;margin-bottom:16px">About Our Church</h2>
    <p style="font-size:1.05rem;color:#444;line-height:1.8">${escHtml(d.about || 'We are a vibrant, welcoming community of believers committed to loving God and serving others.')}</p>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'We\'d Love to Meet You', 'Fill out the form and we\'ll reach out to help plan your first visit.')}
${buildFooter(d)}`
    });
  }
};

// ── 18 Portfolio / Agency ─────────────────────────────────────────────────────
export const template18 = {
  id: '18',
  name: 'Portfolio / Agency',
  sections: ['hero','work','services','about','contact'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#work',label:'Work'},
      {href:'#services',label:'Services'},
      {href:'#about',label:'About'},
    ], 'Start a Project', '#contact');
    return buildPage({
      title: d.agencyName || d.businessName || 'Creative Agency',
      description: d.tagline || 'We build things that work',
      themeColor: d.themeColor || '#18181b',
      navBg: '#18181b',
      navText: '#fff',
      extraCss: `.work-grid{display:grid;gap:20px;grid-template-columns:1fr}@media(min-width:768px){.work-grid{grid-template-columns:repeat(2,1fr)}}@media(min-width:1024px){.work-grid{grid-template-columns:repeat(3,1fr)}}.work-item{border-radius:12px;overflow:hidden;background:#f4f4f5;aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;font-weight:700;color:#888;font-size:.9rem}`,
      body: `
${nav}
<section class="hero" style="background:#18181b;color:#fff">
  <div class="container">
    <span class="badge" style="background:rgba(255,255,255,.1);color:#fff">${escHtml(d.specialty || 'Design · Development · Strategy')}</span>
    <h1 style="color:#fff">${escHtml(d.headline || 'We Build Digital Experiences')}</h1>
    <p style="color:rgba(255,255,255,.7)">${escHtml(d.tagline || 'Creative agency helping brands connect, convert, and grow.')}</p>
    <div class="btn-group">
      <a href="#contact" class="btn" style="background:#fff;color:#18181b">Start a Project</a>
      <a href="#work" class="btn" style="color:#fff;border:2px solid rgba(255,255,255,.3)">View Work</a>
    </div>
  </div>
</section>
<section class="section" id="work">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Selected Work</h2>
    <div class="work-grid">
      ${(d.projects || [{title:'Project Alpha',category:'Web Design'},{title:'Project Beta',category:'Branding'},{title:'Project Gamma',category:'Development'},{title:'Project Delta',category:'Strategy'},{title:'Project Epsilon',category:'UX Design'},{title:'Project Zeta',category:'Marketing'}]).map(p=>
        `<div class="work-item"><div style="text-align:center"><div style="font-size:1.2rem;font-weight:800;color:#18181b;margin-bottom:4px">${escHtml(p.title)}</div><div style="font-size:.8rem;color:#888">${escHtml(p.category||'')}</div></div></div>`
      ).join('')}
    </div>
  </div>
</section>
<section class="section" id="services" style="background:#f4f4f5">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">What We Do</h2>
    <div class="cards">
      ${(d.services || ['Web Design','Brand Identity','Digital Strategy','Development','Photography','Marketing']).map(s=>
        `<div class="card"><h3>${escHtml(s)}</h3><p>${escHtml(d.serviceDesc || 'Crafted with precision, delivered on time.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
${buildLeadForm(d, d.orgSlug || '', 'Start a Project', 'Tell us about your project and we\'ll be in touch within 24 hours.')}
${buildFooter(d)}`
    });
  }
};

// ── 19 Membership / Community ─────────────────────────────────────────────────
export const template19 = {
  id: '19',
  name: 'Membership / Community',
  sections: ['hero','benefits','tiers','testimonials','join'],
  render(d) {
    const nav = buildNav(d, [
      {href:'#benefits',label:'Benefits'},
      {href:'#tiers',label:'Membership'},
      {href:'#testimonials',label:'Members'},
    ], 'Join Now', '#join');
    return buildPage({
      title: d.communityName || d.businessName || 'Community',
      description: d.tagline || 'Join our growing community',
      themeColor: d.themeColor || '#0891b2',
      body: `
${nav}
<section class="hero" style="background:linear-gradient(135deg,#ecfeff 0%,#cffafe 100%)">
  <div class="container">
    ${d.memberCount ? `<span class="badge">${escHtml(d.memberCount)}+ Members</span>` : ''}
    <h1>${escHtml(d.headline || 'Join the Community')}</h1>
    <p>${escHtml(d.tagline || 'Connect with like-minded people, grow together, and achieve more.')}</p>
    <div class="btn-group">
      <a href="#join" class="btn btn-primary">Join Now</a>
      <a href="#benefits" class="btn btn-secondary">See Benefits</a>
    </div>
  </div>
</section>
<section class="section" id="benefits">
  <div class="container">
    <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Member Benefits</h2>
    <div class="cards">
      ${(d.benefits || ['Private Community Access','Live Q&A Sessions','Exclusive Resources','Networking Events','Expert Mentorship','Member Discounts']).map((b,i)=>
        `<div class="card"><div class="card-icon">${['🔑','🎙️','📚','🤝','🏆','💰'][i]||'⭐'}</div><h3>${escHtml(b)}</h3><p>${escHtml(d.benefitDesc || 'Exclusively for our members.')}</p></div>`
      ).join('')}
    </div>
  </div>
</section>
${d.tiers ? `<section class="section" id="tiers" style="background:#f8faff"><div class="container">
  <h2 class="text-center" style="font-size:1.8rem;font-weight:800;margin-bottom:32px">Membership Plans</h2>
  <div class="pricing-grid">
    ${d.tiers.map((t,i)=>`<div class="pricing-card ${i===1?'featured':''}">
      <h3 style="font-weight:700;margin-bottom:8px">${escHtml(t.name)}</h3>
      <div class="price">${escHtml(t.price)}<span>/${escHtml(t.period||'mo')}</span></div>
      <ul>${(t.features||[]).map(f=>`<li>${escHtml(f)}</li>`).join('')}</ul>
      <a href="#join" class="btn btn-primary" style="width:100%">Join</a>
    </div>`).join('')}
  </div>
</div></section>` : ''}
${buildLeadForm(d, d.orgSlug || '', 'Ready to Join?', 'Fill out the form and we\'ll get you started right away.')}
${buildFooter(d)}`
    });
  }
};

// ── 20 Coming Soon / Waitlist ─────────────────────────────────────────────────
export const template20 = {
  id: '20',
  name: 'Coming Soon / Waitlist',
  sections: ['hero','waitlist'],
  render(d) {
    const launchDate = d.launchDate ? new Date(d.launchDate).getTime() : null;
    return buildPage({
      title: d.headline || d.businessName || 'Coming Soon',
      description: d.tagline || 'Something amazing is coming',
      themeColor: d.themeColor || '#7c3aed',
      extraCss: `.coming-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;background:linear-gradient(135deg,var(--primary) 0%,#1e1b4b 100%);color:#fff}
.coming-box{width:100%;max-width:520px;text-align:center}
.countdown{display:flex;gap:16px;justify-content:center;margin:28px 0;flex-wrap:wrap}
.countdown-unit{background:rgba(255,255,255,.15);border-radius:12px;padding:16px 20px;min-width:72px}
.countdown-num{font-size:2rem;font-weight:800;display:block}
.countdown-label{font-size:.75rem;opacity:.7;text-transform:uppercase;letter-spacing:.08em}`,
      body: `
<div class="coming-page">
  <div class="coming-box">
    <h1 style="font-size:clamp(2rem,5vw,3.5rem);font-weight:800;margin-bottom:16px;color:#fff">${escHtml(d.headline || 'Something Big Is Coming')}</h1>
    <p style="font-size:1.15rem;opacity:.85;margin-bottom:32px">${escHtml(d.tagline || 'We\'re working hard to bring you something amazing. Join the waitlist to be first in line.')}</p>
    ${launchDate ? `
    <div class="countdown" id="countdown">
      <div class="countdown-unit"><span class="countdown-num" id="cd-days">--</span><span class="countdown-label">Days</span></div>
      <div class="countdown-unit"><span class="countdown-num" id="cd-hours">--</span><span class="countdown-label">Hours</span></div>
      <div class="countdown-unit"><span class="countdown-num" id="cd-mins">--</span><span class="countdown-label">Minutes</span></div>
      <div class="countdown-unit"><span class="countdown-num" id="cd-secs">--</span><span class="countdown-label">Seconds</span></div>
    </div>
    <script>
    (function(){
      var target=${launchDate};
      function update(){
        var diff=Math.max(0,target-Date.now());
        document.getElementById('cd-days').textContent=Math.floor(diff/86400000);
        document.getElementById('cd-hours').textContent=Math.floor((diff%86400000)/3600000);
        document.getElementById('cd-mins').textContent=Math.floor((diff%3600000)/60000);
        document.getElementById('cd-secs').textContent=Math.floor((diff%60000)/1000);
      }
      update();setInterval(update,1000);
    })();
    </script>` : ''}
    <form class="form" id="lead-form" onsubmit="submitLead(event,'${escHtml(d.orgSlug||'')}')">
      <input type="text" name="name" placeholder="Your Name" required style="background:rgba(255,255,255,.9);border-color:transparent">
      <input type="email" name="email" placeholder="Email Address" required style="background:rgba(255,255,255,.9);border-color:transparent">
      <button type="submit" class="btn" style="background:#fff;color:var(--primary);font-weight:700;font-size:1rem">${escHtml(d.ctaLabel || 'Join the Waitlist')}</button>
      <p id="form-msg" style="font-size:.9rem;min-height:20px;opacity:.85"></p>
    </form>
  </div>
</div>
<script>
async function submitLead(e, slug){
  e.preventDefault();
  var msg = document.getElementById('form-msg');
  msg.textContent = 'Joining...';
  try {
    var data = Object.fromEntries(new FormData(e.target).entries());
    data.orgSlug = slug;
    var res = await fetch('/api/capture-lead',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(res.ok){ msg.textContent = '${escHtml(d.successMsg || "You\\'re on the list! We\\'ll be in touch.")}'; e.target.reset(); }
    else { msg.textContent = 'Something went wrong. Please try again.'; }
  } catch(err){ msg.textContent = 'Network error. Please try again.'; }
}
</script>`
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE REGISTRY — map of id → template object
// ═══════════════════════════════════════════════════════════════════════════════
export const TEMPLATES = {
  '01': template01,
  '02': template02,
  '03': template03,
  '04': template04,
  '05': template05,
  '06': template06,
  '07': template07,
  '08': template08,
  '09': template09,
  '10': template10,
  '11': template11,
  '12': template12,
  '13': template13,
  '14': template14,
  '15': template15,
  '16': template16,
  '17': template17,
  '18': template18,
  '19': template19,
  '20': template20,
};

/** Resolve a template by numeric ID string or by name (case-insensitive) */
export function getTemplate(idOrName) {
  if (TEMPLATES[idOrName]) return TEMPLATES[idOrName];
  const lower = String(idOrName).toLowerCase();
  return Object.values(TEMPLATES).find(t => t.name.toLowerCase() === lower) || null;
}

/** Return all template definitions (id, name, sections) without render functions */
export function listTemplates() {
  return Object.values(TEMPLATES).map(({ id, name, sections }) => ({ id, name, sections }));
}
