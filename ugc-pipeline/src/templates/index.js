// Seedance 2.0 ad format templates - follows Sirio Berati's UGC framework
// Reference: docs/seedance-prompt-guide.md
//
// Core formula:
//   [Image Reference @tag] → [Subject + Wardrobe + Product]
//     → [Action + Movement + Camera]
//     → [Tone + Style + Feeling]
//     → [Dialogue / Spoken Line]

function pickSellingPoint(brand, idx) {
  const points = brand.sellingPoints || [];
  if (!points.length) return brand.description || brand.name;
  return points[idx % points.length];
}

function buildDialogue(brand, hookIdx, bodyIdx) {
  const hooks = [
    `All right so here's the thing - I used to ${brand.category === 'wellness' ? 'overcomplicate my routine' : 'struggle with this every day'}`,
    `I was today years old when I realized I do not need to ${brand.category === 'wellness' ? 'carry 10 bottles' : 'do all of this manually'}`,
    `Everyone kept telling me to try this and I finally get the hype`,
    `True story - my doctor told me I needed ${brand.category === 'wellness' ? 'more vitamins' : 'to change something'}`,
    `So I get asked all the time, what's my one ${brand.category || 'health'} secret`
  ];
  const sp1 = pickSellingPoint(brand, bodyIdx);
  const sp2 = pickSellingPoint(brand, bodyIdx + 1);
  const cta = brand.discountCode ? `Use code ${brand.discountCode} to save` : 'Save with the link in bio';
  const linkInBio = brand.cta || 'Link in bio';

  const hook = hooks[hookIdx % hooks.length];
  const body = `Then I found ${brand.name}. ${sp1}, ${sp2}. I genuinely am obsessed.`;
  return { hook, body, cta: `${cta}. ${linkInBio}.` };
}

// ── UGC Talking Head (Structural Descriptive) ──
function ugc(brand, num, idx) {
  const d = buildDialogue(brand, idx, idx);
  const subjectGender = brand.subjectGender || 'female';
  const tone = brand.tone || 'energetic';

  const prompt = `Using @image1 as the subject reference and @image2 as the ${brand.name} product reference, create a realistic iPhone style UGC video featuring a ${subjectGender} creator holding the product and speaking directly to camera. She is dressed in casual everyday wear in a bright natural setting. She gestures naturally with the product visible throughout, angled toward camera so the ${brand.name} is clearly readable. Authentic ${tone} delivery, casual creator content feel, slight front camera imperfection, not overly polished. She says exactly: "${d.hook}. ${d.body} ${d.cta}" Natural lighting, phone camera quality, natural skin texture, social media native aesthetic.`;

  return {
    prompt,
    script: `${d.hook}. ${d.body} ${d.cta}`,
    timeline: {
      '0-3s': `Hook + product reveal: ${d.hook}`,
      '3-12s': `Body + selling points: ${d.body}`,
      '12-15s': `CTA: ${d.cta}`
    }
  };
}

// ── Podcast Ad (Structural Breakdown) ──
function podcast(brand, num, idx) {
  const d = buildDialogue(brand, (idx + 2) % 5, idx);
  const prompt = `Reference: @image1 the host, @image2 the ${brand.name} product
Setting: professional podcast studio with warm lighting, microphones visible, two-shot framing
Subject: male host in his 30s, casual button-down shirt
Wardrobe: simple solid color, no logos
Product: ${brand.name}, held casually on the desk, label readable
Tone: conversational, authoritative, naturally enthusiastic
Action: Host picks up the product mid-conversation, shows it to camera and to the off-screen guest, then sets it down naturally
[00:00-00:03] Host gestures with one hand mid-thought, picks up @image2 ${brand.name}
[00:03-00:10] Holds product up, looks into camera, says exactly: "${d.hook}. ${d.body}"
[00:10-00:15] Sets product back down, leans in, delivers: "${d.cta}"
Style: cinematic podcast aesthetic, shallow depth of field, professional broadcast feel`;

  return {
    prompt,
    script: `${d.hook}. ${d.body} ${d.cta}`,
    timeline: {
      '0-3s': 'Host gestures, picks up product',
      '3-10s': `Hook + body: ${d.hook}`,
      '10-15s': `CTA: ${d.cta}`
    }
  };
}

// ── Lifestyle / Multi-Reference (Freestyle) ──
function lifestyle(brand, num, idx) {
  const settings = ['cozy morning kitchen with golden hour light', 'minimalist apartment with natural window light', 'sunlit bedroom with linen textures'];
  const setting = settings[idx % settings.length];
  const d = buildDialogue(brand, (idx + 1) % 5, idx);

  const prompt = `Create a lifestyle commercial for the ${brand.name} in @image1 using @image2 as the subject reference, set in a ${setting}. It should feel cinematic, aspirational, and lifestyle focused. Subject interacts with the product naturally as part of her morning routine - picking it up, using it, setting it down with intention. Camera moves slowly with subtle dolly motion. Voiceover delivery feels personal and unhurried, she says: "${d.hook}. ${d.body} ${d.cta}" Premium aesthetic, soft natural lighting, shallow depth of field, gentle film grain, warm color grade.`;

  return {
    prompt,
    script: `${d.hook}. ${d.body} ${d.cta}`,
    timeline: {
      '0-5s': `Setting establishes, subject picks up product (${setting})`,
      '5-12s': `Hook + body voiceover: ${d.body}`,
      '12-15s': `CTA close: ${d.cta}`
    }
  };
}

// ── TikTok Greenscreen ──
function greenscreen(brand, num, idx) {
  const colors = ['bold yellow', 'electric pink', 'lime green', 'royal blue'];
  const color = colors[idx % colors.length];
  const d = buildDialogue(brand, (idx + 3) % 5, idx);
  const subjectGender = brand.subjectGender || 'female';

  const prompt = `iPhone style UGC talking head cutout of a ${subjectGender} influencer speaking directly to camera against a ${color} background, with ${brand.name} product packages from @image1 floating above her in a collage layout. She gestures with one finger as if recommending the product, leans slightly forward with creator energy. Bright, punchy ad aesthetic, casual creator content feel, promotional brand visual. She is talking about ${brand.name}: "${d.hook}. ${d.body} ${d.cta}" Natural skin texture, phone camera quality, social media native, optimized for TikTok feed.`;

  return {
    prompt,
    script: `${d.hook}. ${d.body} ${d.cta}`,
    timeline: {
      '0-2s': 'Cut to talking head against bold background',
      '2-12s': `Body + product callout: ${d.body}`,
      '12-15s': `Final pitch: ${d.cta}`
    }
  };
}

// ── ASMR Product Review (Freestyle) ──
function asmr(brand, num, idx) {
  const prompt = `asmr product review of ${brand.name} from @image1. Close handheld overhead angle with both hands in frame, just like a real creator on a clean surface. Show the product being picked up, examined slowly, and used in its natural way. Focus on satisfying tactile details: fingers gripping the packaging, glossy surface catching light, slow deliberate movements, crisp ASMR sounds. Whispered voiceover delivers: "${pickSellingPoint(brand, idx)}". Authentic phone camera quality, natural lighting, realistic social media unboxing feel. ${brand.discountCode ? `Code ${brand.discountCode} on screen at end.` : ''}`;

  return {
    prompt,
    script: pickSellingPoint(brand, idx),
    timeline: {
      '0-5s': 'Hands enter frame, product picked up slowly',
      '5-12s': 'Tactile examination, ASMR sounds',
      '12-15s': 'Final reveal + brand callout'
    }
  };
}

// ── Unboxing (Structural Descriptive) ──
function unboxing(brand, num, idx) {
  const prompt = `ASMR unboxing video of ${brand.name} from @image1, shot from a close handheld overhead angle with both hands in frame, just like a real creator unboxing on a table or against a clean wall. Show the box being held in one hand while the other hand uses a utility knife to slowly slice through the seal. Focus on satisfying tactile details: blade dragging across the wrap, crinkle of plastic, fingers gripping the box, glossy packaging catching light, lid opening, ${brand.name} revealed piece by piece. Keep composition tight and product focused, with authentic phone camera quality, natural lighting, crisp ASMR sounds, slow deliberate movements, realistic social media unboxing feel.`;

  return {
    prompt,
    script: `Unboxing ${brand.name} - ${pickSellingPoint(brand, idx)}`,
    timeline: {
      '0-3s': 'Box held in frame, blade approaches',
      '3-10s': 'Slow seal cut, plastic crinkle',
      '10-15s': `Lid opens, ${brand.name} revealed`
    }
  };
}

// ── News Anchor (Structural Timestamp) ──
function newsAnchor(brand, num, idx) {
  const d = buildDialogue(brand, (idx + 4) % 5, idx);
  const prompt = `Professional news anchor in a modern broadcast studio, sitting at a glass news desk with @image1 displayed as a graphic over their shoulder showing ${brand.name}. Studio lighting, lower-third graphics, broadcast camera quality.
[00:00-00:02] Anchor looks up from desk, makes eye contact with camera
[00:02-00:08] Reads with measured authoritative delivery: "Breaking in ${brand.category || 'wellness'}: ${brand.name} ${brand.description ? brand.description.toLowerCase() : 'is taking over the market'}. Experts call it ${pickSellingPoint(brand, idx).toLowerCase()}."
[00:08-00:15] Closes segment: "${d.cta}"
Style: authoritative broadcast aesthetic, sharp focus, professional grading.`;

  return {
    prompt,
    script: `Breaking news: ${brand.name} - ${d.cta}`,
    timeline: {
      '0-2s': 'Anchor looks up, eye contact',
      '2-8s': `News segment about ${brand.name}`,
      '8-15s': `CTA close: ${d.cta}`
    }
  };
}

// ── Cinematic / HBO Style (Structural Descriptive) ──
function cinematic(brand, num, idx) {
  const d = buildDialogue(brand, idx, (idx + 1) % 5);
  const prompt = `Cinematic HBO-style commercial for ${brand.name} from @image1. Subject in @image2 in a moody premium setting, golden hour or blue hour lighting, shallow depth of field, slow tracking camera movement. Subject moves through the space with intention, picks up the ${brand.name}, examines it as if discovering something. Voiceover delivered with poetic measured cadence: "${d.hook}. ${d.body} ${d.cta}" Premium aesthetic, fine film grain, rich color grade, atmospheric ambient sound, sparse minimalist score.`;

  return {
    prompt,
    script: `${d.hook}. ${d.body} ${d.cta}`,
    timeline: {
      '0-4s': 'Atmospheric establish, subject enters',
      '4-10s': `Hook + body voiceover: ${d.body}`,
      '10-15s': `Cinematic close + CTA: ${d.cta}`
    }
  };
}

module.exports = {
  ugc,
  podcast,
  lifestyle,
  'tiktok-greenscreen': greenscreen,
  asmr,
  unboxing,
  'news-anchor': newsAnchor,
  cinematic
};
