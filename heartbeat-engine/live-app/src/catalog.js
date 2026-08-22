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
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_HT2shgPJzeOIbCJy20EsVg_qIRauR1E';

function catalogGenres(show) {
  if (Array.isArray(show.normalized_genres) && show.normalized_genres.length) return show.normalized_genres;
  if (show.genre && show.genre !== 'Short drama') return [show.genre];
  return ['Uncategorized'];
}

async function loadDatabaseCatalog() {
  const headers = { apikey: publishableKey };
  const [showsResponse, episodesResponse] = await Promise.all([
    fetch('https://njfhzabmaxhfzekbzpzz.supabase.co/rest/v1/shortdrama_shows?select=*&order=source_order.asc', { headers }),
    fetch('https://njfhzabmaxhfzekbzpzz.supabase.co/rest/v1/shortdrama_episodes?select=*&order=episode_number.asc', { headers }),
  ]);
  if (!showsResponse.ok || !episodesResponse.ok) throw new Error('database catalog unavailable');
  const shows = await showsResponse.json();
  const episodes = await episodesResponse.json();
  const byShow = episodes.reduce((map, episode) => {
    const group = map.get(episode.show_id) || [];
    group.push(episode);
    map.set(episode.show_id, group);
    return map;
  }, new Map());
  return shows.map((show) => {
    const genres = catalogGenres(show);
    return ({
    id: show.id,
    title: show.title,
    eyebrow: 'TikTok Short Drama',
    year: '2026',
    genre: genres[0],
    genres,
    sourceCategories: show.source_categories || [],
    description: show.description || `Watch all ${show.episode_count} short episodes.`,
    coverUrl: show.cover_url,
    heroUrl: show.hero_url || show.cover_url,
    episodeCount: show.episode_count,
    source: show.source,
    episodes: (byShow.get(show.id) || []).map((episode) => ({
      id: episode.id,
      number: episode.episode_number,
      title: episode.title,
      description: episode.description,
      duration: episode.duration_seconds,
      thumbnailUrl: episode.thumbnail_url || show.cover_url,
      videoUrl: episode.video_url,
    })),
    });
  });
}

export async function loadCatalog() {
  try {
    const shows = await loadDatabaseCatalog();
    if (shows.length) return { featuredId: 'big-pivot', shows: [...fallbackCatalog.shows, ...shows] };
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
