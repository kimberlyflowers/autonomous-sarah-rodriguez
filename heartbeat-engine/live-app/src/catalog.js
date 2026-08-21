const storage = 'https://njfhzabmaxhfzekbzpzz.supabase.co/storage/v1/object/public';
const bigPivotVideo = `${storage}/bloom-artifacts/videos/big-pivot/episode1-list-best-served-cold/big-pivot-episode1-clean-audio-2x.mp4`;
const heroBase = `${storage}/bloom-images/big-pivot/live-2026-06-26/heroes-clean-hires`;

export const fallbackCatalog = {
  featuredId: 'big-pivot',
  shows: [{
    id: 'big-pivot',
    title: 'The Big Pivot',
    eyebrow: 'Bloomie Original Series',
    year: '2026',
    genre: 'Business drama',
    description: 'Business stories for owners, operators, and creators who know every growth decision comes with stakes.',
    coverUrl: `${heroBase}/01-apartment.png`,
    heroUrl: `${heroBase}/01-apartment.png`,
    previewUrl: bigPivotVideo,
    source: 'bloomie',
    episodes: [
      ['How To Market To Strangers', '01-apartment.png', 'A quiet corporate celebration turns tense when Sarah realizes the deal on the table is not the deal everyone agreed to.'],
      ['The Club Exit', '02-rooftop.png', 'Outside a private club, Sarah catches the look that tells her the story being sold inside is already falling apart.'],
      ['The Toast Goes Cold', '03-awards.png', 'At the dinner table, one glance exposes the announcement nobody was ready to hear.'],
      ['The Club Exit', '04-city.png', 'One look outside the club tells Sarah the story being sold inside is falling apart.'],
      ['Platform Pressure', '05-subway.png', 'One message changes the route and forces Sarah to decide who still deserves the truth.'],
      ['The Library Clause', '06-library.png', 'Sarah finds the clause that turns a polished partnership into a power play.'],
    ].map(([title, image, description], index) => ({
      id: `big-pivot-${index + 1}`,
      number: index + 1,
      title,
      description,
      thumbnailUrl: `${heroBase}/${image}`,
      videoUrl: bigPivotVideo,
      duration: 104,
    })),
  }],
};

export const catalogUrl = import.meta.env.VITE_CATALOG_URL ||
  `${storage}/shortdrama-videos/catalog/catalog.json`;

export async function loadCatalog() {
  try {
    const response = await fetch(catalogUrl, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`catalog ${response.status}`);
    const catalog = await response.json();
    if (!Array.isArray(catalog.shows)) throw new Error('invalid catalog');
    const originals = fallbackCatalog.shows.filter((show) =>
      !catalog.shows.some((entry) => entry.id === show.id));
    return { ...catalog, shows: [...originals, ...catalog.shows] };
  } catch {
    return fallbackCatalog;
  }
}
