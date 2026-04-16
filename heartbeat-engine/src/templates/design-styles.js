// BLOOM Website Plugin — Design Style Presets
// Visual style systems that layer ON TOP of any template
// Each style provides: fonts, colors, shadows, radii, gradients, and extra CSS
// Usage: applyStyle(templateHTML, styleName) or getStyle('stripe')

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const DESIGN_STYLES = {

  // ── 01 Clean Precision (inspired by Stripe) ─────────────────────────────────
  'clean-precision': {
    id: 'clean-precision',
    name: 'Clean Precision',
    description: 'Refined, developer-friendly elegance. Crisp whites, subtle gradients, and meticulous spacing.',
    vibe: 'polished, trustworthy, premium',
    fonts: {
      heading: "'Inter', 'SF Pro Display', -apple-system, sans-serif",
      body: "'Inter', 'SF Pro Text', -apple-system, sans-serif",
      googleImport: "Inter:wght@400;500;600;700;800"
    },
    colors: {
      primary: '#635BFF',
      secondary: '#0A2540',
      accent: '#00D4AA',
      dark: '#0A2540',
      light: '#F6F9FC',
      muted: '#425466',
      surface: '#FFFFFF',
      border: '#E3E8EE'
    },
    shadows: {
      sm: '0 1px 3px rgba(0,0,0,0.08)',
      md: '0 4px 12px rgba(0,0,0,0.08)',
      lg: '0 8px 30px rgba(0,0,0,0.12)',
      glow: '0 0 40px rgba(99,91,255,0.15)'
    },
    radii: { sm: '6px', md: '10px', lg: '16px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(180deg, #F6F9FC 0%, #FFFFFF 100%)',
      accent: 'linear-gradient(135deg, #635BFF 0%, #7C6FFF 100%)',
      dark: 'linear-gradient(135deg, #0A2540 0%, #1B3A5C 100%)'
    },
    extraCss: `
      body{font-feature-settings:'cv02','cv03','cv04','cv11';letter-spacing:-0.011em}
      h1,h2,h3{letter-spacing:-0.03em;color:#0A2540}
      .card{border:1px solid #E3E8EE;box-shadow:0 1px 3px rgba(0,0,0,0.08);transition:box-shadow .2s,transform .2s}
      .card:hover{box-shadow:0 8px 30px rgba(0,0,0,0.12);transform:translateY(-2px)}
      .btn-primary{border-radius:100px;font-weight:600;letter-spacing:0}
      .hero{background:#F6F9FC}
      .badge{background:#F0EEFF;color:#635BFF;font-weight:600;border-radius:100px}
      .nav{background:rgba(255,255,255,0.9);backdrop-filter:blur(12px);border-bottom:1px solid #E3E8EE}
    `
  },

  // ── 02 Bold Minimalism (inspired by Apple) ──────────────────────────────────
  'bold-minimalism': {
    id: 'bold-minimalism',
    name: 'Bold Minimalism',
    description: 'Breathtaking simplicity. Massive typography, generous whitespace, zero clutter.',
    vibe: 'premium, confident, spacious',
    fonts: {
      heading: "'SF Pro Display', 'Helvetica Neue', Helvetica, sans-serif",
      body: "'SF Pro Text', 'Helvetica Neue', Helvetica, sans-serif",
      googleImport: "Inter:wght@400;500;600;700;800;900"
    },
    colors: {
      primary: '#1D1D1F',
      secondary: '#0071E3',
      accent: '#0071E3',
      dark: '#1D1D1F',
      light: '#FBFBFD',
      muted: '#86868B',
      surface: '#FFFFFF',
      border: '#D2D2D7'
    },
    shadows: {
      sm: 'none',
      md: '0 4px 16px rgba(0,0,0,0.06)',
      lg: '0 12px 40px rgba(0,0,0,0.1)',
      glow: 'none'
    },
    radii: { sm: '8px', md: '12px', lg: '20px', pill: '980px' },
    gradients: {
      hero: '#FBFBFD',
      accent: 'linear-gradient(180deg, #0071E3 0%, #0077ED 100%)',
      dark: '#1D1D1F'
    },
    extraCss: `
      body{-webkit-font-smoothing:antialiased}
      h1{font-size:clamp(2.5rem,7vw,5rem)!important;font-weight:700;line-height:1.05;letter-spacing:-0.045em}
      h2{font-size:clamp(1.8rem,4vw,3rem)!important;font-weight:700;letter-spacing:-0.03em}
      .hero{padding:120px 20px 100px!important;background:#FBFBFD}
      .hero p{font-size:clamp(1.1rem,2.5vw,1.4rem)!important;color:#86868B;max-width:580px}
      .btn-primary{background:#0071E3;border-radius:980px;padding:14px 32px;font-weight:500}
      .btn-secondary{border-radius:980px;border-color:#0071E3;color:#0071E3}
      .card{border:none;background:#F5F5F7;border-radius:20px;box-shadow:none}
      .section{padding:100px 20px!important}
      .nav{background:rgba(251,251,253,0.8);backdrop-filter:saturate(180%) blur(20px)}
    `
  },

  // ── 03 Warm Sunset (inspired by Airbnb) ─────────────────────────────────────
  'warm-sunset': {
    id: 'warm-sunset',
    name: 'Warm Sunset',
    description: 'Friendly, approachable warmth. Rounded shapes, soft photography style, inviting palette.',
    vibe: 'welcoming, human, cozy',
    fonts: {
      heading: "'Nunito Sans', sans-serif",
      body: "'Nunito Sans', sans-serif",
      googleImport: "Nunito+Sans:wght@400;600;700;800"
    },
    colors: {
      primary: '#FF385C',
      secondary: '#222222',
      accent: '#FF385C',
      dark: '#222222',
      light: '#F7F7F7',
      muted: '#717171',
      surface: '#FFFFFF',
      border: '#DDDDDD'
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.08)',
      md: '0 2px 8px rgba(0,0,0,0.1)',
      lg: '0 6px 20px rgba(0,0,0,0.12)',
      glow: '0 0 20px rgba(255,56,92,0.15)'
    },
    radii: { sm: '8px', md: '12px', lg: '16px', pill: '32px' },
    gradients: {
      hero: 'linear-gradient(180deg, #FFF5F5 0%, #FFFFFF 100%)',
      accent: 'linear-gradient(135deg, #FF385C 0%, #E31C5F 100%)',
      dark: 'linear-gradient(135deg, #222222 0%, #333333 100%)'
    },
    extraCss: `
      h1,h2,h3{color:#222222;letter-spacing:-0.02em}
      .hero{background:linear-gradient(180deg,#FFF5F5 0%,#FFFFFF 100%)}
      .card{border:1px solid #DDDDDD;border-radius:16px;transition:box-shadow .2s}
      .card:hover{box-shadow:0 6px 20px rgba(0,0,0,0.12)}
      .btn-primary{background:linear-gradient(135deg,#FF385C 0%,#E31C5F 100%);border-radius:8px;font-weight:600}
      .btn-secondary{border-radius:8px;border-color:#222;color:#222}
      .badge{background:#FFF0F3;color:#FF385C;border-radius:32px}
      .nav{border-bottom:1px solid #DDDDDD;box-shadow:none}
      .testimonial{background:#FFF5F5;border-left-color:#FF385C}
    `
  },

  // ── 04 Dark Luxe (inspired by Linear) ──────────────────────────────────────
  'dark-luxe': {
    id: 'dark-luxe',
    name: 'Dark Luxe',
    description: 'Sleek dark mode with purple accents. Modern, fast, engineering-grade aesthetic.',
    vibe: 'cutting-edge, powerful, elegant',
    fonts: {
      heading: "'Inter', sans-serif",
      body: "'Inter', sans-serif",
      googleImport: "Inter:wght@400;500;600;700;800"
    },
    colors: {
      primary: '#5E6AD2',
      secondary: '#F1F1F1',
      accent: '#5E6AD2',
      dark: '#0A0A0F',
      light: '#15151E',
      muted: '#8A8F98',
      surface: '#1B1B25',
      border: '#2A2A3C'
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.3)',
      md: '0 4px 16px rgba(0,0,0,0.4)',
      lg: '0 8px 30px rgba(0,0,0,0.5)',
      glow: '0 0 60px rgba(94,106,210,0.2)'
    },
    radii: { sm: '6px', md: '10px', lg: '16px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(180deg, #0A0A0F 0%, #15151E 100%)',
      accent: 'linear-gradient(135deg, #5E6AD2 0%, #8B7FE8 100%)',
      dark: '#0A0A0F'
    },
    extraCss: `
      body{background:#0A0A0F;color:#F1F1F1}
      h1,h2,h3{color:#F1F1F1;letter-spacing:-0.03em}
      .hero{background:linear-gradient(180deg,#0A0A0F 0%,#15151E 100%);color:#F1F1F1}
      .hero p{color:#8A8F98}
      .section{background:#0A0A0F}
      .card{background:#1B1B25;border:1px solid #2A2A3C;color:#F1F1F1}
      .card p{color:#8A8F98}
      .card:hover{border-color:#5E6AD2;box-shadow:0 0 40px rgba(94,106,210,0.1)}
      .btn-primary{background:linear-gradient(135deg,#5E6AD2 0%,#8B7FE8 100%);border-radius:8px}
      .btn-secondary{border-color:#5E6AD2;color:#5E6AD2}
      .nav{background:rgba(10,10,15,0.85);backdrop-filter:blur(12px);border-bottom:1px solid #2A2A3C;box-shadow:none}
      .nav-logo{color:#F1F1F1}
      .nav-links a{color:#8A8F98}
      .nav-links a:hover{color:#F1F1F1}
      .badge{background:rgba(94,106,210,0.15);color:#8B7FE8}
      .footer{background:#08080D;border-top:1px solid #2A2A3C}
      .testimonial{background:#1B1B25;border-left-color:#5E6AD2}
      .testimonial p{color:#CCCCCC}
      .form input,.form textarea,.form select{background:#1B1B25;border-color:#2A2A3C;color:#F1F1F1}
      .form input:focus,.form textarea:focus{border-color:#5E6AD2}
      .stat-number{color:#5E6AD2}
      .pricing-card{background:#1B1B25;border-color:#2A2A3C;color:#F1F1F1}
    `
  },

  // ── 05 Coral Energy (inspired by Notion) ────────────────────────────────────
  'coral-energy': {
    id: 'coral-energy',
    name: 'Coral Energy',
    description: 'Clean, tool-like clarity. Cream backgrounds, crisp borders, readable and friendly.',
    vibe: 'organized, clear, productive',
    fonts: {
      heading: "'DM Sans', sans-serif",
      body: "'DM Sans', sans-serif",
      googleImport: "DM+Sans:wght@400;500;600;700;800"
    },
    colors: {
      primary: '#EB5757',
      secondary: '#37352F',
      accent: '#EB5757',
      dark: '#37352F',
      light: '#FFFCF5',
      muted: '#787774',
      surface: '#FFFFFF',
      border: '#E8E5E0'
    },
    shadows: {
      sm: '0 1px 2px rgba(55,53,47,0.06)',
      md: '0 3px 10px rgba(55,53,47,0.08)',
      lg: '0 6px 24px rgba(55,53,47,0.12)',
      glow: 'none'
    },
    radii: { sm: '4px', md: '6px', lg: '12px', pill: '100px' },
    gradients: {
      hero: '#FFFCF5',
      accent: 'linear-gradient(135deg, #EB5757 0%, #F07070 100%)',
      dark: '#37352F'
    },
    extraCss: `
      body{color:#37352F}
      h1,h2,h3{color:#37352F;letter-spacing:-0.02em;font-weight:700}
      .hero{background:#FFFCF5}
      .card{border:1px solid #E8E5E0;border-radius:6px;box-shadow:none}
      .card:hover{background:#F7F6F3;box-shadow:0 3px 10px rgba(55,53,47,0.08)}
      .btn-primary{background:#EB5757;border-radius:6px;font-weight:600}
      .badge{background:#FDEAEA;color:#EB5757;border-radius:4px}
      .nav{background:#FFFFFF;border-bottom:1px solid #E8E5E0;box-shadow:none}
      .testimonial{background:#F7F6F3;border-left-color:#EB5757}
    `
  },

  // ── 06 Ocean Depth (inspired by Vercel) ─────────────────────────────────────
  'ocean-depth': {
    id: 'ocean-depth',
    name: 'Ocean Depth',
    description: 'Pure black-and-white precision with razor-sharp focus. Code-forward, zero decoration.',
    vibe: 'stark, fast, technical',
    fonts: {
      heading: "'Geist', 'Inter', sans-serif",
      body: "'Geist', 'Inter', sans-serif",
      googleImport: "Inter:wght@400;500;600;700;800"
    },
    colors: {
      primary: '#000000',
      secondary: '#EDEDED',
      accent: '#0070F3',
      dark: '#000000',
      light: '#FAFAFA',
      muted: '#666666',
      surface: '#FFFFFF',
      border: '#EAEAEA'
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.04)',
      md: '0 4px 8px rgba(0,0,0,0.08)',
      lg: '0 8px 24px rgba(0,0,0,0.12)',
      glow: '0 0 0 3px rgba(0,112,243,0.2)'
    },
    radii: { sm: '5px', md: '8px', lg: '12px', pill: '100px' },
    gradients: {
      hero: '#FAFAFA',
      accent: 'linear-gradient(135deg, #0070F3 0%, #00A1F1 100%)',
      dark: '#000000'
    },
    extraCss: `
      body{color:#111}
      h1,h2,h3{color:#000;letter-spacing:-0.04em;font-weight:800}
      h1{font-size:clamp(2.5rem,6vw,4.5rem)!important}
      .hero{background:#FAFAFA;border-bottom:1px solid #EAEAEA}
      .card{border:1px solid #EAEAEA;border-radius:8px;box-shadow:none;transition:border-color .15s}
      .card:hover{border-color:#000}
      .btn-primary{background:#000;color:#fff;border-radius:5px;font-weight:500}
      .btn-primary:hover{background:#333}
      .btn-secondary{border-color:#000;color:#000;border-radius:5px}
      .badge{background:#000;color:#fff;font-size:.75rem;border-radius:100px}
      .nav{background:rgba(255,255,255,0.7);backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid #EAEAEA;box-shadow:none}
      .footer{background:#000;color:#888}
      .testimonial{border-left-color:#000;background:#FAFAFA}
    `
  },

  // ── 07 Neon Pulse (inspired by Figma) ───────────────────────────────────────
  'neon-pulse': {
    id: 'neon-pulse',
    name: 'Neon Pulse',
    description: 'Vibrant multi-color palette with playful energy. Gradients galore, creative and expressive.',
    vibe: 'creative, vibrant, expressive',
    fonts: {
      heading: "'Plus Jakarta Sans', sans-serif",
      body: "'Plus Jakarta Sans', sans-serif",
      googleImport: "Plus+Jakarta+Sans:wght@400;500;600;700;800"
    },
    colors: {
      primary: '#A259FF',
      secondary: '#1E1E1E',
      accent: '#0ACF83',
      dark: '#1E1E1E',
      light: '#F5F5F5',
      muted: '#8C8C8C',
      surface: '#FFFFFF',
      border: '#E5E5E5'
    },
    shadows: {
      sm: '0 1px 3px rgba(0,0,0,0.08)',
      md: '0 4px 16px rgba(162,89,255,0.12)',
      lg: '0 8px 30px rgba(162,89,255,0.18)',
      glow: '0 0 60px rgba(162,89,255,0.25)'
    },
    radii: { sm: '8px', md: '12px', lg: '16px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(135deg, #FFF4E6 0%, #F5E6FF 50%, #E6FFF4 100%)',
      accent: 'linear-gradient(135deg, #A259FF 0%, #FF7262 50%, #0ACF83 100%)',
      dark: 'linear-gradient(135deg, #1E1E1E 0%, #2C2C2C 100%)'
    },
    extraCss: `
      h1,h2,h3{letter-spacing:-0.02em}
      .hero{background:linear-gradient(135deg,#FFF4E6 0%,#F5E6FF 50%,#E6FFF4 100%)}
      .btn-primary{background:linear-gradient(135deg,#A259FF 0%,#FF7262 100%);border-radius:12px;font-weight:700}
      .btn-primary:hover{filter:brightness(1.08);transform:translateY(-1px)}
      .card{border-radius:16px;border:1px solid #E5E5E5;transition:all .2s}
      .card:hover{box-shadow:0 8px 30px rgba(162,89,255,0.15);transform:translateY(-4px)}
      .badge{background:linear-gradient(135deg,#F5E6FF 0%,#E6FFF4 100%);color:#A259FF;border-radius:100px}
      .testimonial{background:linear-gradient(135deg,#FFF9F0 0%,#F8F0FF 100%);border-left-color:#A259FF}
      .stat-number{background:linear-gradient(135deg,#A259FF 0%,#FF7262 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    `
  },

  // ── 08 Sage Earth (organic, nature-inspired) ────────────────────────────────
  'sage-earth': {
    id: 'sage-earth',
    name: 'Sage Earth',
    description: 'Grounded, natural warmth. Earthy tones, organic shapes, wellness-oriented calm.',
    vibe: 'natural, calming, grounded',
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Source Sans 3', sans-serif",
      googleImport: "Playfair+Display:wght@400;500;600;700;800&family=Source+Sans+3:wght@400;500;600;700"
    },
    colors: {
      primary: '#5F7161',
      secondary: '#3C3C3C',
      accent: '#C4956A',
      dark: '#2C2C2C',
      light: '#FAF8F5',
      muted: '#8B8B8B',
      surface: '#FFFFFF',
      border: '#E8E4DF'
    },
    shadows: {
      sm: '0 1px 3px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(0,0,0,0.06)',
      lg: '0 8px 24px rgba(0,0,0,0.08)',
      glow: 'none'
    },
    radii: { sm: '4px', md: '8px', lg: '16px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(180deg, #FAF8F5 0%, #F3EDE6 100%)',
      accent: 'linear-gradient(135deg, #5F7161 0%, #7A9A7C 100%)',
      dark: 'linear-gradient(135deg, #2C2C2C 0%, #3C3C3C 100%)'
    },
    extraCss: `
      h1,h2,h3{font-family:'Playfair Display',serif;color:#2C2C2C;letter-spacing:-0.01em}
      body{font-family:'Source Sans 3',sans-serif;color:#3C3C3C}
      .hero{background:linear-gradient(180deg,#FAF8F5 0%,#F3EDE6 100%)}
      .card{border:1px solid #E8E4DF;border-radius:8px;box-shadow:none}
      .card:hover{background:#FAF8F5}
      .btn-primary{background:#5F7161;border-radius:4px;font-family:'Source Sans 3',sans-serif;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;font-size:.9rem}
      .btn-secondary{border-color:#5F7161;color:#5F7161;border-radius:4px}
      .badge{background:#EDF2ED;color:#5F7161;border-radius:4px}
      .nav{background:rgba(250,248,245,0.95);border-bottom:1px solid #E8E4DF;box-shadow:none}
      .testimonial{background:#FAF8F5;border-left-color:#C4956A}
      .footer{background:#2C2C2C}
    `
  },

  // ── 09 Electric Blue (inspired by Coinbase) ─────────────────────────────────
  'electric-blue': {
    id: 'electric-blue',
    name: 'Electric Blue',
    description: 'Trust-forward fintech feel. Strong blues, sharp corners, data confidence.',
    vibe: 'trustworthy, modern, financial',
    fonts: {
      heading: "'DM Sans', sans-serif",
      body: "'DM Sans', sans-serif",
      googleImport: "DM+Sans:wght@400;500;600;700;800"
    },
    colors: {
      primary: '#0052FF',
      secondary: '#050F1A',
      accent: '#0052FF',
      dark: '#050F1A',
      light: '#F5F8FF',
      muted: '#5B616E',
      surface: '#FFFFFF',
      border: '#D1D5DB'
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(0,82,255,0.1)',
      lg: '0 8px 24px rgba(0,82,255,0.15)',
      glow: '0 0 40px rgba(0,82,255,0.15)'
    },
    radii: { sm: '4px', md: '8px', lg: '12px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(180deg, #F5F8FF 0%, #FFFFFF 100%)',
      accent: 'linear-gradient(135deg, #0052FF 0%, #1673FF 100%)',
      dark: 'linear-gradient(135deg, #050F1A 0%, #0C1E33 100%)'
    },
    extraCss: `
      h1,h2,h3{color:#050F1A;letter-spacing:-0.02em;font-weight:700}
      .hero{background:linear-gradient(180deg,#F5F8FF 0%,#FFFFFF 100%)}
      .btn-primary{background:#0052FF;border-radius:100px;font-weight:600}
      .btn-secondary{border-radius:100px;border-color:#0052FF;color:#0052FF}
      .card{border:1px solid #D1D5DB;border-radius:12px}
      .card:hover{border-color:#0052FF;box-shadow:0 4px 12px rgba(0,82,255,0.1)}
      .badge{background:#E8EFFF;color:#0052FF;border-radius:100px}
      .stat-number{color:#0052FF}
    `
  },

  // ── 10 Midnight Gold (luxury, high-end) ─────────────────────────────────────
  'midnight-gold': {
    id: 'midnight-gold',
    name: 'Midnight Gold',
    description: 'Opulent dark palette with gold accents. High-end, exclusive, aspirational.',
    vibe: 'luxury, exclusive, premium',
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Outfit', sans-serif",
      googleImport: "Cormorant+Garamond:wght@400;500;600;700&family=Outfit:wght@300;400;500;600"
    },
    colors: {
      primary: '#C9A96E',
      secondary: '#F5F0E8',
      accent: '#C9A96E',
      dark: '#0D0D0D',
      light: '#1A1A1A',
      muted: '#999999',
      surface: '#141414',
      border: '#2A2A2A'
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.5)',
      md: '0 4px 16px rgba(0,0,0,0.5)',
      lg: '0 8px 30px rgba(201,169,110,0.15)',
      glow: '0 0 40px rgba(201,169,110,0.2)'
    },
    radii: { sm: '2px', md: '4px', lg: '8px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(180deg, #0D0D0D 0%, #1A1A1A 100%)',
      accent: 'linear-gradient(135deg, #C9A96E 0%, #E0C98F 100%)',
      dark: '#0D0D0D'
    },
    extraCss: `
      body{background:#0D0D0D;color:#F5F0E8;font-family:'Outfit',sans-serif;font-weight:300}
      h1,h2,h3{font-family:'Cormorant Garamond',serif;color:#F5F0E8;letter-spacing:0.02em;font-weight:400}
      h1{font-size:clamp(2.5rem,6vw,4.5rem)!important;font-weight:300}
      .hero{background:#0D0D0D;color:#F5F0E8}
      .hero p{color:#999}
      .section{background:#0D0D0D}
      .card{background:#141414;border:1px solid #2A2A2A;color:#F5F0E8;border-radius:4px}
      .card p{color:#999}
      .card:hover{border-color:#C9A96E}
      .btn-primary{background:transparent;border:1px solid #C9A96E;color:#C9A96E;border-radius:0;text-transform:uppercase;letter-spacing:0.15em;font-family:'Outfit',sans-serif;font-weight:400;font-size:.85rem}
      .btn-primary:hover{background:#C9A96E;color:#0D0D0D}
      .btn-secondary{border-color:#F5F0E8;color:#F5F0E8;border-radius:0;text-transform:uppercase;letter-spacing:0.15em;font-size:.85rem}
      .badge{background:transparent;border:1px solid #C9A96E;color:#C9A96E;border-radius:0;text-transform:uppercase;letter-spacing:0.12em;font-size:.7rem}
      .nav{background:rgba(13,13,13,0.9);backdrop-filter:blur(12px);border-bottom:1px solid #2A2A2A;box-shadow:none}
      .nav-logo{color:#C9A96E;font-family:'Cormorant Garamond',serif;font-size:1.4rem!important}
      .nav-links a{color:#999}
      .nav-links a:hover{color:#F5F0E8}
      .footer{background:#080808;border-top:1px solid #2A2A2A}
      .testimonial{background:#141414;border-left-color:#C9A96E}
      .testimonial p{color:#CCC}
      .form input,.form textarea,.form select{background:#141414;border-color:#2A2A2A;color:#F5F0E8;border-radius:2px}
      .form input:focus,.form textarea:focus{border-color:#C9A96E}
      .stat-number{color:#C9A96E}
      .pricing-card{background:#141414;border-color:#2A2A2A;color:#F5F0E8}
    `
  },

  // ── 11 Fresh Mint (inspired by Spotify) ─────────────────────────────────────
  'fresh-mint': {
    id: 'fresh-mint',
    name: 'Fresh Mint',
    description: 'Vibrant green on dark. Music-app energy, bold pops of color, youthful.',
    vibe: 'energetic, youthful, bold',
    fonts: {
      heading: "'Montserrat', sans-serif",
      body: "'Montserrat', sans-serif",
      googleImport: "Montserrat:wght@400;500;600;700;800;900"
    },
    colors: {
      primary: '#1DB954',
      secondary: '#FFFFFF',
      accent: '#1DB954',
      dark: '#121212',
      light: '#181818',
      muted: '#B3B3B3',
      surface: '#282828',
      border: '#333333'
    },
    shadows: {
      sm: '0 2px 4px rgba(0,0,0,0.3)',
      md: '0 4px 16px rgba(0,0,0,0.4)',
      lg: '0 8px 30px rgba(29,185,84,0.2)',
      glow: '0 0 50px rgba(29,185,84,0.3)'
    },
    radii: { sm: '4px', md: '8px', lg: '12px', pill: '500px' },
    gradients: {
      hero: 'linear-gradient(180deg, #121212 0%, #181818 100%)',
      accent: 'linear-gradient(135deg, #1DB954 0%, #1ED760 100%)',
      dark: '#121212'
    },
    extraCss: `
      body{background:#121212;color:#FFFFFF;font-weight:500}
      h1,h2,h3{color:#FFFFFF;font-weight:900;letter-spacing:-0.03em;text-transform:uppercase}
      h1{font-size:clamp(2rem,6vw,4rem)!important}
      .hero{background:linear-gradient(180deg,#121212 0%,#181818 100%);color:#fff}
      .hero p{color:#B3B3B3}
      .section{background:#121212}
      .card{background:#282828;border:none;border-radius:8px;color:#fff}
      .card p{color:#B3B3B3}
      .card:hover{background:#333}
      .btn-primary{background:#1DB954;color:#000;border-radius:500px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
      .btn-secondary{border-color:#fff;color:#fff;border-radius:500px;text-transform:uppercase;letter-spacing:0.05em}
      .badge{background:rgba(29,185,84,0.15);color:#1DB954;border-radius:4px;font-weight:700}
      .nav{background:rgba(18,18,18,0.9);backdrop-filter:blur(10px);border-bottom:1px solid #333;box-shadow:none}
      .nav-logo{color:#fff}
      .nav-links a{color:#B3B3B3}
      .nav-links a:hover{color:#fff}
      .footer{background:#000;border-top:1px solid #333}
      .testimonial{background:#282828;border-left-color:#1DB954}
      .testimonial p{color:#DDD}
      .form input,.form textarea,.form select{background:#282828;border-color:#333;color:#fff}
      .form input:focus,.form textarea:focus{border-color:#1DB954}
      .stat-number{color:#1DB954}
      .pricing-card{background:#282828;border-color:#333;color:#fff}
    `
  },

  // ── 12 Soft Blush (feminine, beauty brand) ──────────────────────────────────
  'soft-blush': {
    id: 'soft-blush',
    name: 'Soft Blush',
    description: 'Feminine elegance with blush pinks and cream. Perfect for beauty, fashion, and lifestyle brands.',
    vibe: 'feminine, elegant, soft',
    fonts: {
      heading: "'Cormorant Garamond', serif",
      body: "'Lato', sans-serif",
      googleImport: "Cormorant+Garamond:wght@400;500;600;700&family=Lato:wght@300;400;700"
    },
    colors: {
      primary: '#D4858A',
      secondary: '#2C2C2C',
      accent: '#D4858A',
      dark: '#2C2C2C',
      light: '#FDF8F6',
      muted: '#9C9C9C',
      surface: '#FFFFFF',
      border: '#F0E4E0'
    },
    shadows: {
      sm: '0 1px 3px rgba(0,0,0,0.04)',
      md: '0 4px 12px rgba(212,133,138,0.1)',
      lg: '0 8px 24px rgba(212,133,138,0.15)',
      glow: 'none'
    },
    radii: { sm: '4px', md: '8px', lg: '16px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(180deg, #FDF8F6 0%, #FFF0ED 100%)',
      accent: 'linear-gradient(135deg, #D4858A 0%, #E8A5A8 100%)',
      dark: '#2C2C2C'
    },
    extraCss: `
      h1,h2,h3{font-family:'Cormorant Garamond',serif;color:#2C2C2C;font-weight:500;letter-spacing:0.01em}
      h1{font-size:clamp(2.5rem,6vw,4rem)!important;font-weight:400}
      body{font-family:'Lato',sans-serif;font-weight:300;color:#2C2C2C}
      .hero{background:linear-gradient(180deg,#FDF8F6 0%,#FFF0ED 100%)}
      .card{border:1px solid #F0E4E0;border-radius:4px;box-shadow:none}
      .card:hover{box-shadow:0 4px 12px rgba(212,133,138,0.1)}
      .btn-primary{background:#D4858A;border-radius:0;text-transform:uppercase;letter-spacing:0.12em;font-size:.85rem;font-family:'Lato',sans-serif;font-weight:400}
      .btn-secondary{border-color:#D4858A;color:#D4858A;border-radius:0;text-transform:uppercase;letter-spacing:0.12em;font-size:.85rem}
      .badge{background:#FFF0ED;color:#D4858A;border-radius:2px;text-transform:uppercase;letter-spacing:0.08em;font-size:.75rem}
      .nav{background:rgba(253,248,246,0.95);border-bottom:1px solid #F0E4E0;box-shadow:none}
      .testimonial{background:#FDF8F6;border-left-color:#D4858A}
      .footer{background:#2C2C2C}
    `
  },

  // ── 13 Terracotta (inspired by Claude / Anthropic) ──────────────────────────
  'terracotta': {
    id: 'terracotta',
    name: 'Terracotta',
    description: 'Warm terracotta accent with clean editorial layout. Thoughtful, human-centered.',
    vibe: 'warm, thoughtful, editorial',
    fonts: {
      heading: "'Sora', sans-serif",
      body: "'Sora', sans-serif",
      googleImport: "Sora:wght@300;400;500;600;700"
    },
    colors: {
      primary: '#D97757',
      secondary: '#1A1A2E',
      accent: '#D97757',
      dark: '#1A1A2E',
      light: '#FAF7F4',
      muted: '#7A7A8A',
      surface: '#FFFFFF',
      border: '#E8E2DC'
    },
    shadows: {
      sm: '0 1px 3px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(0,0,0,0.07)',
      lg: '0 8px 24px rgba(0,0,0,0.1)',
      glow: 'none'
    },
    radii: { sm: '8px', md: '12px', lg: '20px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(180deg, #FAF7F4 0%, #FFFFFF 100%)',
      accent: 'linear-gradient(135deg, #D97757 0%, #E09070 100%)',
      dark: '#1A1A2E'
    },
    extraCss: `
      h1,h2,h3{color:#1A1A2E;letter-spacing:-0.02em;font-weight:600}
      .hero{background:linear-gradient(180deg,#FAF7F4 0%,#FFFFFF 100%)}
      .card{border:1px solid #E8E2DC;border-radius:16px}
      .card:hover{box-shadow:0 4px 12px rgba(0,0,0,0.07)}
      .btn-primary{background:#D97757;border-radius:12px;font-weight:600}
      .badge{background:#FFF0EA;color:#D97757;border-radius:100px}
      .nav{background:rgba(255,255,255,0.9);backdrop-filter:blur(10px);border-bottom:1px solid #E8E2DC;box-shadow:none}
      .testimonial{background:#FAF7F4;border-left-color:#D97757}
    `
  },

  // ── 14 Brutalist Raw ────────────────────────────────────────────────────────
  'brutalist-raw': {
    id: 'brutalist-raw',
    name: 'Brutalist Raw',
    description: 'Anti-design energy. Monospaced type, hard borders, raw aesthetic.',
    vibe: 'raw, unconventional, bold',
    fonts: {
      heading: "'Space Mono', monospace",
      body: "'Space Grotesk', sans-serif",
      googleImport: "Space+Mono:wght@400;700&family=Space+Grotesk:wght@400;500;600;700"
    },
    colors: {
      primary: '#FF0000',
      secondary: '#000000',
      accent: '#FFFF00',
      dark: '#000000',
      light: '#F0F0F0',
      muted: '#666666',
      surface: '#FFFFFF',
      border: '#000000'
    },
    shadows: {
      sm: '3px 3px 0 #000',
      md: '5px 5px 0 #000',
      lg: '8px 8px 0 #000',
      glow: 'none'
    },
    radii: { sm: '0', md: '0', lg: '0', pill: '0' },
    gradients: {
      hero: '#F0F0F0',
      accent: '#FF0000',
      dark: '#000000'
    },
    extraCss: `
      h1,h2,h3{font-family:'Space Mono',monospace;text-transform:uppercase;letter-spacing:0.05em}
      h1{font-size:clamp(2rem,5vw,3.5rem)!important}
      body{font-family:'Space Grotesk',sans-serif}
      .hero{background:#F0F0F0;border-bottom:3px solid #000}
      .card{border:2px solid #000;border-radius:0;box-shadow:5px 5px 0 #000}
      .card:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 #000}
      .btn-primary{background:#FF0000;border-radius:0;font-family:'Space Mono',monospace;text-transform:uppercase;letter-spacing:0.1em;border:2px solid #000;box-shadow:3px 3px 0 #000}
      .btn-primary:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 #000}
      .btn-secondary{border:2px solid #000;border-radius:0;color:#000;box-shadow:3px 3px 0 #000;text-transform:uppercase;letter-spacing:0.1em;font-family:'Space Mono',monospace}
      .badge{background:#FFFF00;color:#000;border-radius:0;border:2px solid #000;text-transform:uppercase;font-family:'Space Mono',monospace}
      .nav{border-bottom:3px solid #000;box-shadow:none;background:#fff}
      .footer{background:#000;border-top:3px solid #FF0000}
      .testimonial{border:2px solid #000;border-left:5px solid #FF0000;background:#F0F0F0;border-radius:0}
      .form input,.form textarea{border:2px solid #000;border-radius:0}
      .form input:focus,.form textarea:focus{border-color:#FF0000;box-shadow:3px 3px 0 #FF0000}
    `
  },

  // ── 15 Royal Navy (professional, corporate) ─────────────────────────────────
  'royal-navy': {
    id: 'royal-navy',
    name: 'Royal Navy',
    description: 'Commanding navy and white. Traditional professionalism with modern touches.',
    vibe: 'authoritative, professional, established',
    fonts: {
      heading: "'Merriweather', serif",
      body: "'Source Sans 3', sans-serif",
      googleImport: "Merriweather:wght@400;700;900&family=Source+Sans+3:wght@400;500;600;700"
    },
    colors: {
      primary: '#1B365D',
      secondary: '#C7A951',
      accent: '#C7A951',
      dark: '#0F1F36',
      light: '#F5F7FA',
      muted: '#6B7280',
      surface: '#FFFFFF',
      border: '#D1D5DB'
    },
    shadows: {
      sm: '0 1px 3px rgba(0,0,0,0.08)',
      md: '0 4px 12px rgba(27,54,93,0.1)',
      lg: '0 8px 24px rgba(27,54,93,0.15)',
      glow: 'none'
    },
    radii: { sm: '4px', md: '6px', lg: '8px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(135deg, #1B365D 0%, #2A4F7E 100%)',
      accent: 'linear-gradient(135deg, #C7A951 0%, #D4B96A 100%)',
      dark: '#0F1F36'
    },
    extraCss: `
      h1,h2,h3{font-family:'Merriweather',serif;letter-spacing:-0.01em}
      body{font-family:'Source Sans 3',sans-serif}
      .hero{background:linear-gradient(135deg,#1B365D 0%,#2A4F7E 100%);color:#fff}
      .hero h1{color:#fff}
      .hero p{color:rgba(255,255,255,0.8)}
      .btn-primary{background:#C7A951;color:#0F1F36;border-radius:4px;font-weight:600}
      .btn-secondary{border-color:#fff;color:#fff;border-radius:4px}
      .card{border:1px solid #D1D5DB;border-radius:6px}
      .badge{background:#F0EDDF;color:#1B365D;border-radius:4px}
      .nav{background:#1B365D;box-shadow:none}
      .nav-logo{color:#C7A951}
      .nav-links a{color:rgba(255,255,255,0.8)}
      .nav-links a:hover{color:#fff}
      .nav-cta{background:#C7A951!important;color:#0F1F36!important}
      .testimonial{border-left-color:#C7A951}
      .stat-number{color:#1B365D}
    `
  },

  // ── 16 Candy Pop (playful, youth-oriented) ──────────────────────────────────
  'candy-pop': {
    id: 'candy-pop',
    name: 'Candy Pop',
    description: 'Bright, bouncy, and fun. Rounded everything, candy colors, maximum friendliness.',
    vibe: 'playful, fun, approachable',
    fonts: {
      heading: "'Poppins', sans-serif",
      body: "'Poppins', sans-serif",
      googleImport: "Poppins:wght@400;500;600;700;800;900"
    },
    colors: {
      primary: '#FF6B6B',
      secondary: '#4ECDC4',
      accent: '#FFE66D',
      dark: '#2C3E50',
      light: '#FFF9F9',
      muted: '#95A5A6',
      surface: '#FFFFFF',
      border: '#F0E0E0'
    },
    shadows: {
      sm: '0 2px 4px rgba(255,107,107,0.1)',
      md: '0 4px 16px rgba(255,107,107,0.15)',
      lg: '0 8px 30px rgba(255,107,107,0.2)',
      glow: '0 0 30px rgba(255,107,107,0.2)'
    },
    radii: { sm: '12px', md: '16px', lg: '24px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(135deg, #FFF9F9 0%, #F0FFFE 100%)',
      accent: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E8E 100%)',
      dark: '#2C3E50'
    },
    extraCss: `
      h1,h2,h3{letter-spacing:-0.02em;font-weight:800}
      h1{font-size:clamp(2.2rem,5vw,3.5rem)!important}
      .hero{background:linear-gradient(135deg,#FFF9F9 0%,#F0FFFE 100%)}
      .card{border-radius:20px;border:2px solid #F0E0E0;box-shadow:0 4px 16px rgba(255,107,107,0.08)}
      .card:hover{transform:translateY(-6px);box-shadow:0 12px 30px rgba(255,107,107,0.18)}
      .btn-primary{background:linear-gradient(135deg,#FF6B6B 0%,#FF8E8E 100%);border-radius:100px;font-weight:700;padding:14px 32px}
      .btn-secondary{border-radius:100px;border-color:#4ECDC4;color:#4ECDC4;font-weight:700}
      .badge{background:#FFE66D;color:#2C3E50;border-radius:100px;font-weight:700}
      .testimonial{background:linear-gradient(135deg,#FFF9F9 0%,#F0FFFE 100%);border-left-color:#4ECDC4;border-radius:16px}
      .stat-number{background:linear-gradient(135deg,#FF6B6B 0%,#4ECDC4 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    `
  },

  // ── 17 Slate Pro (inspired by IBM) ──────────────────────────────────────────
  'slate-pro': {
    id: 'slate-pro',
    name: 'Slate Pro',
    description: 'Enterprise-grade design system. Structured, accessible, reliable.',
    vibe: 'enterprise, systematic, reliable',
    fonts: {
      heading: "'IBM Plex Sans', sans-serif",
      body: "'IBM Plex Sans', sans-serif",
      googleImport: "IBM+Plex+Sans:wght@400;500;600;700"
    },
    colors: {
      primary: '#0F62FE',
      secondary: '#161616',
      accent: '#0F62FE',
      dark: '#161616',
      light: '#F4F4F4',
      muted: '#6F6F6F',
      surface: '#FFFFFF',
      border: '#E0E0E0'
    },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.1)',
      md: '0 2px 6px rgba(0,0,0,0.15)',
      lg: '0 4px 16px rgba(0,0,0,0.15)',
      glow: 'none'
    },
    radii: { sm: '0', md: '0', lg: '0', pill: '100px' },
    gradients: {
      hero: '#F4F4F4',
      accent: '#0F62FE',
      dark: '#161616'
    },
    extraCss: `
      h1,h2,h3{font-weight:600;letter-spacing:0}
      .hero{background:#F4F4F4;border-bottom:1px solid #E0E0E0}
      .card{border:none;border-radius:0;border-top:3px solid #0F62FE;box-shadow:0 1px 2px rgba(0,0,0,0.1)}
      .card:hover{box-shadow:0 2px 6px rgba(0,0,0,0.15)}
      .btn-primary{background:#0F62FE;border-radius:0;font-weight:500}
      .btn-secondary{border-color:#0F62FE;color:#0F62FE;border-radius:0}
      .badge{background:#E8F0FE;color:#0F62FE;border-radius:0;font-weight:600}
      .nav{background:#161616;box-shadow:none}
      .nav-logo{color:#fff}
      .nav-links a{color:rgba(255,255,255,0.7)}
      .nav-links a:hover{color:#fff}
      .nav-cta{background:#0F62FE!important}
      .footer{background:#161616}
      .testimonial{border-radius:0;border-left-color:#0F62FE;background:#F4F4F4}
    `
  },

  // ── 18 Desert Dusk (warm southwestern) ──────────────────────────────────────
  'desert-dusk': {
    id: 'desert-dusk',
    name: 'Desert Dusk',
    description: 'Warm southwestern palette. Burnt orange, deep clay, sunset gradients.',
    vibe: 'warm, authentic, artisan',
    fonts: {
      heading: "'Libre Baskerville', serif",
      body: "'Karla', sans-serif",
      googleImport: "Libre+Baskerville:wght@400;700&family=Karla:wght@400;500;600;700"
    },
    colors: {
      primary: '#C2552D',
      secondary: '#2D1810',
      accent: '#D4943A',
      dark: '#2D1810',
      light: '#FBF5EF',
      muted: '#8B7B6E',
      surface: '#FFFFFF',
      border: '#E8DDD4'
    },
    shadows: {
      sm: '0 1px 3px rgba(0,0,0,0.06)',
      md: '0 4px 12px rgba(194,85,45,0.1)',
      lg: '0 8px 24px rgba(194,85,45,0.15)',
      glow: 'none'
    },
    radii: { sm: '4px', md: '8px', lg: '12px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(180deg, #FBF5EF 0%, #F5EBE0 100%)',
      accent: 'linear-gradient(135deg, #C2552D 0%, #D4943A 100%)',
      dark: '#2D1810'
    },
    extraCss: `
      h1,h2,h3{font-family:'Libre Baskerville',serif;color:#2D1810}
      body{font-family:'Karla',sans-serif;color:#2D1810}
      .hero{background:linear-gradient(180deg,#FBF5EF 0%,#F5EBE0 100%)}
      .card{border:1px solid #E8DDD4;border-radius:8px}
      .card:hover{box-shadow:0 4px 12px rgba(194,85,45,0.1)}
      .btn-primary{background:linear-gradient(135deg,#C2552D 0%,#D4943A 100%);border-radius:6px;font-family:'Karla',sans-serif;font-weight:700}
      .btn-secondary{border-color:#C2552D;color:#C2552D;border-radius:6px}
      .badge{background:#FBF0E5;color:#C2552D;border-radius:4px}
      .testimonial{background:#FBF5EF;border-left-color:#D4943A}
      .stat-number{color:#C2552D}
      .footer{background:#2D1810}
    `
  },

  // ── 19 Aurora (gradient-heavy, modern SaaS) ─────────────────────────────────
  'aurora': {
    id: 'aurora',
    name: 'Aurora',
    description: 'Mesmerizing gradient backgrounds. Modern SaaS energy with flowing color transitions.',
    vibe: 'futuristic, dynamic, mesmerizing',
    fonts: {
      heading: "'Outfit', sans-serif",
      body: "'Outfit', sans-serif",
      googleImport: "Outfit:wght@300;400;500;600;700;800"
    },
    colors: {
      primary: '#7C3AED',
      secondary: '#EC4899',
      accent: '#06B6D4',
      dark: '#0F0720',
      light: '#FAF5FF',
      muted: '#9CA3AF',
      surface: '#FFFFFF',
      border: '#E5E7EB'
    },
    shadows: {
      sm: '0 1px 3px rgba(124,58,237,0.1)',
      md: '0 4px 16px rgba(124,58,237,0.15)',
      lg: '0 8px 30px rgba(124,58,237,0.2)',
      glow: '0 0 80px rgba(124,58,237,0.3)'
    },
    radii: { sm: '8px', md: '12px', lg: '20px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(135deg, #0F0720 0%, #1A0B3E 30%, #2D1054 60%, #0F0720 100%)',
      accent: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 50%, #06B6D4 100%)',
      dark: '#0F0720'
    },
    extraCss: `
      body{background:#0F0720;color:#F3F4F6}
      h1,h2,h3{color:#F3F4F6;letter-spacing:-0.03em;font-weight:700}
      .hero{background:linear-gradient(135deg,#0F0720 0%,#1A0B3E 30%,#2D1054 60%,#0F0720 100%);color:#fff;position:relative;overflow:hidden}
      .hero::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(circle at 30% 40%,rgba(124,58,237,0.15) 0%,transparent 50%),radial-gradient(circle at 70% 60%,rgba(236,72,153,0.1) 0%,transparent 50%);pointer-events:none}
      .hero p{color:#9CA3AF}
      .section{background:#0F0720}
      .card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(8px);border-radius:16px;color:#F3F4F6}
      .card p{color:#9CA3AF}
      .card:hover{border-color:rgba(124,58,237,0.5);box-shadow:0 0 30px rgba(124,58,237,0.15)}
      .btn-primary{background:linear-gradient(135deg,#7C3AED 0%,#EC4899 100%);border-radius:12px;font-weight:600}
      .btn-secondary{border-color:rgba(255,255,255,0.3);color:#fff;border-radius:12px}
      .badge{background:rgba(124,58,237,0.2);color:#C4B5FD;border-radius:100px}
      .nav{background:rgba(15,7,32,0.8);backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,0.06);box-shadow:none}
      .nav-logo{color:#fff}
      .nav-links a{color:#9CA3AF}
      .nav-links a:hover{color:#fff}
      .footer{background:#080412;border-top:1px solid rgba(255,255,255,0.06)}
      .testimonial{background:rgba(255,255,255,0.05);border-left-color:#7C3AED}
      .testimonial p{color:#D1D5DB}
      .form input,.form textarea,.form select{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);color:#F3F4F6}
      .form input:focus,.form textarea:focus{border-color:#7C3AED}
      .stat-number{background:linear-gradient(135deg,#7C3AED 0%,#EC4899 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
      .pricing-card{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);color:#F3F4F6}
    `
  },

  // ── 20 Gospel Bold (faith-based, powerful) ──────────────────────────────────
  'gospel-bold': {
    id: 'gospel-bold',
    name: 'Gospel Bold',
    description: 'Powerful faith-forward design. Deep purples and gold, commanding presence.',
    vibe: 'powerful, inspiring, reverent',
    fonts: {
      heading: "'Playfair Display', serif",
      body: "'Raleway', sans-serif",
      googleImport: "Playfair+Display:wght@400;500;600;700;800;900&family=Raleway:wght@400;500;600;700"
    },
    colors: {
      primary: '#4A0E5C',
      secondary: '#D4AF37',
      accent: '#D4AF37',
      dark: '#1A0522',
      light: '#F8F4FA',
      muted: '#7A6B82',
      surface: '#FFFFFF',
      border: '#E8D8EF'
    },
    shadows: {
      sm: '0 1px 3px rgba(0,0,0,0.1)',
      md: '0 4px 12px rgba(74,14,92,0.1)',
      lg: '0 8px 24px rgba(74,14,92,0.15)',
      glow: '0 0 40px rgba(212,175,55,0.15)'
    },
    radii: { sm: '4px', md: '8px', lg: '12px', pill: '100px' },
    gradients: {
      hero: 'linear-gradient(135deg, #1A0522 0%, #4A0E5C 50%, #2D0936 100%)',
      accent: 'linear-gradient(135deg, #D4AF37 0%, #F0D060 100%)',
      dark: '#1A0522'
    },
    extraCss: `
      h1,h2,h3{font-family:'Playfair Display',serif;letter-spacing:0.01em}
      body{font-family:'Raleway',sans-serif}
      .hero{background:linear-gradient(135deg,#1A0522 0%,#4A0E5C 50%,#2D0936 100%);color:#fff}
      .hero h1{color:#fff;font-weight:800}
      .hero p{color:rgba(255,255,255,0.75)}
      .btn-primary{background:linear-gradient(135deg,#D4AF37 0%,#F0D060 100%);color:#1A0522;border-radius:6px;font-family:'Raleway',sans-serif;font-weight:700}
      .btn-secondary{border-color:#D4AF37;color:#D4AF37;border-radius:6px}
      .card{border:1px solid #E8D8EF;border-radius:8px}
      .card:hover{box-shadow:0 4px 12px rgba(74,14,92,0.1)}
      .badge{background:rgba(212,175,55,0.15);color:#D4AF37;border-radius:4px;text-transform:uppercase;letter-spacing:0.06em}
      .nav{background:#1A0522;box-shadow:none}
      .nav-logo{color:#D4AF37;font-family:'Playfair Display',serif}
      .nav-links a{color:rgba(255,255,255,0.7)}
      .nav-links a:hover{color:#fff}
      .nav-cta{background:linear-gradient(135deg,#D4AF37 0%,#F0D060 100%)!important;color:#1A0522!important}
      .footer{background:#1A0522;border-top:1px solid rgba(212,175,55,0.2)}
      .testimonial{background:#F8F4FA;border-left-color:#D4AF37}
      .stat-number{color:#4A0E5C}
    `
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Get a style by ID */
export function getStyle(idOrName) {
  if (DESIGN_STYLES[idOrName]) return DESIGN_STYLES[idOrName];
  const lower = String(idOrName).toLowerCase();
  return Object.values(DESIGN_STYLES).find(s =>
    s.name.toLowerCase() === lower || s.id === lower
  ) || null;
}

/** List all available styles (without extraCss for compact display) */
export function listStyles() {
  return Object.values(DESIGN_STYLES).map(({ id, name, description, vibe, fonts, colors }) => ({
    id, name, description, vibe,
    fontPair: `${fonts.heading.split(',')[0].replace(/'/g,'')} / ${fonts.body.split(',')[0].replace(/'/g,'')}`,
    palette: [colors.primary, colors.secondary, colors.accent, colors.dark, colors.light]
  }));
}

/** Build the Google Fonts import link for a style */
export function buildFontLink(style) {
  if (!style?.fonts?.googleImport) return '';
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=${style.fonts.googleImport}&display=swap" rel="stylesheet">`;
}

/** Build CSS variable block from a style's colors */
export function buildStyleVars(style) {
  if (!style?.colors) return '';
  const c = style.colors;
  return `
  --primary:${c.primary};
  --secondary:${c.secondary};
  --accent:${c.accent};
  --dark:${c.dark};
  --light:${c.light};
  --muted:${c.muted};
  --surface:${c.surface};
  --border:${c.border};
  --font-heading:${style.fonts?.heading || 'inherit'};
  --font-body:${style.fonts?.body || 'inherit'};`;
}

/** Get style CSS to inject (font link + variables + extra CSS) */
export function getStyleCSS(styleId) {
  const style = getStyle(styleId);
  if (!style) return '';
  return `
${buildFontLink(style)}
<style>
:root{${buildStyleVars(style)}}
body{font-family:${style.fonts.body}}
h1,h2,h3,h4,h5,h6{font-family:${style.fonts.heading}}
${style.extraCss || ''}
</style>`;
}
