// Ad format prompt templates for Seedance 2 video generation
// Each template returns { prompt, script, timeline } for a specific ad format

const ugcVariations = [
  (brand) => ({
    hook: `All right so here's the thing - I used to ${brand.category === 'wellness' ? 'take way too many supplements' : 'struggle with this'} every single day`,
    body: `Then I found ${brand.name}. ${brand.sellingPoints?.[0] || brand.description}. My ${brand.category === 'wellness' ? 'energy is up, my gut feels incredible' : 'life genuinely changed'}.`,
    cta: `Use code ${brand.discountCode || 'SAVE'} for ${brand.discountCode ? '' : '25% '}off. ${brand.cta || 'Link in bio'}.`
  }),
  (brand) => ({
    hook: `Everyone kept telling me to try this and I finally get the hype`,
    body: `${brand.name}. ${brand.sellingPoints?.join(', ') || brand.description}. ${brand.category === 'wellness' ? 'My energy has been insane and my digestion is the best it\'s ever been' : 'It actually works'}.`,
    cta: `Code ${brand.discountCode || 'SAVE'} for a discount. ${brand.cta || 'Link in bio'}.`
  })
];

const podcastVariations = [
  (brand) => ({
    hook: `So I get asked all the time "What's my one ${brand.category || 'health'} secret?"`,
    body: `And honestly it's ${brand.name}. ${brand.sellingPoints?.[0] || brand.description}. One ${brand.category === 'wellness' ? 'scoop every morning' : 'simple step'} and you feel the difference.`,
    cta: `My guest tried it last month and hasn't stopped talking about it. Code ${brand.discountCode || 'SAVE'}. ${brand.cta || 'Link in bio'}.`
  }),
  (brand) => ({
    hook: `True story - my doctor told me I needed ${brand.category === 'wellness' ? 'more vitamins' : 'to change something'}`,
    body: `I said "Doc I can barely remember to eat breakfast." They said "Try ${brand.name}." ${brand.sellingPoints?.slice(0, 2).join('. ') || brand.description}.`,
    cta: `I got my life back. Code ${brand.discountCode || 'SAVE'}. ${brand.cta || 'Link in bio'}.`
  })
];

const lifestyleVariations = [
  (brand) => ({
    hook: `This is how you start your morning right`,
    body: `One ${brand.category === 'wellness' ? 'scoop of ' : ''}${brand.name} before anything else. ${brand.sellingPoints?.join(', ') || brand.description}. It takes 30 seconds and I feel the difference all day.`,
    cta: `${brand.discountCode || 'SAVE'} for ${brand.discountCode ? '' : '25% '}off. ${brand.cta || 'Link in bio'}.`
  }),
  (brand) => ({
    hook: `That first ${brand.category === 'wellness' ? 'scoop' : 'moment'} in the morning`,
    body: `${brand.sellingPoints?.map(p => p.toLowerCase()).join(', ') || brand.description} - all in one ${brand.category === 'wellness' ? 'drink' : 'product'}.`,
    cta: `This is the upgrade. Code ${brand.discountCode || 'SAVE'}. ${brand.cta || 'Link in bio'}.`
  })
];

const greenscreenVariations = [
  (brand) => ({
    hook: `I was today years old when I realized I don't need to overcomplicate this`,
    body: `${brand.name} - ${brand.sellingPoints?.[0] || brand.description}. ${brand.category === 'wellness' ? 'I genuinely am obsessed' : 'It just works'}.`,
    cta: `Save with code ${brand.discountCode || 'SAVE'}. ${brand.cta || 'Link in bio'}.`
  }),
  (brand) => ({
    hook: `${brand.name} vs everything else - let me break this down`,
    body: `${brand.sellingPoints?.join('. ') || brand.description}. ${brand.pricePoint ? `All for ${brand.pricePoint}` : 'Unbeatable value'}.`,
    cta: `Code ${brand.discountCode || 'SAVE'} saves you even more. ${brand.cta || 'Link in bio'}.`
  })
];

const newsAnchorVariations = [
  (brand) => ({
    hook: `Breaking in ${brand.category || 'wellness'} -`,
    body: `${brand.name} ${brand.description ? `just dropped. ${brand.description}` : 'is taking over'}. Experts call it ${brand.sellingPoints?.[0] ? `the most ${brand.sellingPoints[0].toLowerCase()}` : 'a game changer'}.`,
    cta: `Use code ${brand.discountCode || 'SAVE'}. ${brand.cta || 'Link in bio'}.`
  }),
  (brand) => ({
    hook: `Reports confirm:`,
    body: `${brand.name} is the number one trending ${brand.category || 'product'} this quarter. ${brand.sellingPoints?.slice(0, 2).join('. ') || brand.description}.`,
    cta: `Available now with code ${brand.discountCode || 'SAVE'}. ${brand.cta || 'Link in bio'}.`
  })
];

const cinematicVariations = [
  (brand) => ({
    hook: `Your body is a system. Most people run it on bad inputs.`,
    body: `I upgraded mine. ${brand.name}. ${brand.sellingPoints?.join('. ') || brand.description}. ${brand.category === 'wellness' ? 'System optimized' : 'Level unlocked'}.`,
    cta: `While they lag, I operate at full capacity. Code ${brand.discountCode || 'SAVE'}. ${brand.cta || 'Link in bio'}.`
  }),
  (brand) => ({
    hook: `${brand.sellingPoints?.[0] || brand.description}`,
    body: `My friends staged an intervention. They said "Just try ${brand.name}." So I did. ${brand.sellingPoints?.slice(1).join('. ') || ''} I got my life back.`,
    cta: `And my friends. Code ${brand.discountCode || 'SAVE'}. ${brand.cta || 'Link in bio'}.`
  })
];

function buildVariant(brand, variantNum, variationIdx, variations, formatName) {
  const variation = variations[variationIdx % variations.length](brand);
  const fullScript = `${variation.hook} ${variation.body} ${variation.cta}`;

  return {
    prompt: `Subject speaks directly to camera in ${formatName} style ad for ${brand.name}. ${fullScript} Natural delivery, ${brand.tone || 'energetic'} tone. Product visible when mentioned.`,
    script: fullScript,
    timeline: {
      '0-3s': `Hook: ${variation.hook}`,
      '3-10s': `Body: ${variation.body}`,
      '10-15s': `CTA: ${variation.cta}`
    }
  };
}

module.exports = {
  ugc: (brand, num, idx) => buildVariant(brand, num, idx, ugcVariations, 'UGC testimonial'),
  podcast: (brand, num, idx) => buildVariant(brand, num, idx, podcastVariations, 'podcast/interview'),
  lifestyle: (brand, num, idx) => buildVariant(brand, num, idx, lifestyleVariations, 'lifestyle morning routine'),
  'tiktok-greenscreen': (brand, num, idx) => buildVariant(brand, num, idx, greenscreenVariations, 'TikTok green screen'),
  'news-anchor': (brand, num, idx) => buildVariant(brand, num, idx, newsAnchorVariations, 'news anchor breaking news'),
  cinematic: (brand, num, idx) => buildVariant(brand, num, idx, cinematicVariations, 'cinematic HBO-style')
};
