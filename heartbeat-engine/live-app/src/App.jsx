import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fallbackCatalog, loadCatalog } from './catalog.js';

const PlayIcon = () => <span aria-hidden="true">▶</span>;

function ShowCard({ show, onOpen }) {
  const video = useRef(null);
  const startPreview = () => {
    if (!show.previewUrl || !video.current) return;
    video.current.currentTime = 0;
    video.current.play().catch(() => {});
  };
  const stopPreview = () => {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = 0;
  };
  return (
    <button className="show-card" onClick={() => onOpen(show)} onMouseEnter={startPreview} onMouseLeave={stopPreview} onFocus={startPreview} onBlur={stopPreview}>
      <img src={show.coverUrl} alt={`${show.title} cover`} loading="lazy" />
      {show.previewUrl && <video ref={video} src={show.previewUrl} muted loop playsInline preload="metadata" />}
      <span className="card-shade" />
      <span className="card-copy"><strong>{show.title}</strong><small>{show.episodes?.length || show.episodeCount || 0} episodes</small></span>
    </button>
  );
}

function Rail({ title, shows, onOpen }) {
  const rail = useRef(null);
  const move = (direction) => rail.current?.scrollBy({ left: direction * Math.min(window.innerWidth * .8, 1100), behavior: 'smooth' });
  if (!shows.length) return null;
  return <section className="rail-section">
    <div className="rail-heading"><h2>{title}</h2><div><button aria-label={`Previous ${title}`} onClick={() => move(-1)}>‹</button><button aria-label={`Next ${title}`} onClick={() => move(1)}>›</button></div></div>
    <div className="show-rail" ref={rail}>{shows.map((show) => <ShowCard key={show.id} show={show} onOpen={onOpen} />)}</div>
  </section>;
}

function Player({ show, episode, onClose, onEpisode }) {
  const video = useRef(null);
  const touchStart = useRef(null);
  const wheelLocked = useRef(false);
  const playable = useMemo(() => show?.episodes?.filter((item) => item.videoUrl) || [], [show]);
  const active = episode?.videoUrl ? episode : playable[0];
  const activeIndex = playable.findIndex((item) => item.id === active?.id);
  const move = (direction) => {
    if (!playable.length) return;
    const nextIndex = Math.min(playable.length - 1, Math.max(0, activeIndex + direction));
    if (nextIndex !== activeIndex) onEpisode(playable[nextIndex]);
  };

  useEffect(() => {
    if (!show) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (['ArrowDown', 'PageDown'].includes(event.key)) { event.preventDefault(); move(1); }
      if (['ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); move(-1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [show, activeIndex, playable.length]);

  if (!show) return null;
  const onWheel = (event) => {
    if (Math.abs(event.deltaY) < 24 || wheelLocked.current) return;
    wheelLocked.current = true;
    move(event.deltaY > 0 ? 1 : -1);
    window.setTimeout(() => { wheelLocked.current = false; }, 550);
  };
  const onTouchEnd = (event) => {
    if (touchStart.current == null) return;
    const distance = touchStart.current - event.changedTouches[0].clientY;
    if (Math.abs(distance) > 45) move(distance > 0 ? 1 : -1);
    touchStart.current = null;
  };

  return <div className="modal" role="dialog" aria-modal="true" aria-label={show.title} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="modal-panel">
      <button className="close" onClick={onClose} aria-label="Close player">×</button>
      <div className="player-shell" onWheel={onWheel} onTouchStart={(event) => { touchStart.current = event.touches[0].clientY; }} onTouchEnd={onTouchEnd}>
        <div className="player-stage">
          {active?.videoUrl ? <video ref={video} key={active.id} controls autoPlay playsInline poster={active.thumbnailUrl || show.coverUrl} src={active.videoUrl} onEnded={() => move(1)} /> : <img src={show.coverUrl} alt={`${show.title} cover`} />}
          <span className="player-vignette" />
          <div className="episode-overlay">
            <small>{active ? `Episode ${active.number}` : 'Episodes coming soon'}</small>
            <strong>{show.title}</strong>
            {active?.title && <span>{active.title}</span>}
          </div>
        </div>
        <div className="player-nav" aria-label="Episode navigation">
          <button onClick={() => move(-1)} disabled={activeIndex <= 0} aria-label="Previous episode">↑</button>
          <span>{active ? `${activeIndex + 1} / ${playable.length}` : `0 / ${show.episodeCount || show.episodes?.length || 0}`}</span>
          <button onClick={() => move(1)} disabled={activeIndex < 0 || activeIndex >= playable.length - 1} aria-label="Next episode">↓</button>
        </div>
      </div>
      <div className="show-detail">
        <p className="eyebrow">{show.eyebrow || 'TikTok Short Drama'}</p>
        <h2>{show.title}</h2>
        <p>{show.description}</p>
        <div className="meta"><span>{show.year || '2026'}</span><span>{show.genre || 'Short drama'}</span><span>{show.episodes?.length || show.episodeCount || 0} episodes</span></div>
        {!playable.length && <p className="availability">This show is organized and ready. Its episode videos are still being uploaded.</p>}
        {playable.length > 0 && <div className="episode-list">{playable.map((item) => <button className={item.id === active?.id ? 'active' : ''} key={item.id} onClick={() => onEpisode(item)}><img src={item.thumbnailUrl || show.coverUrl} alt="" loading="lazy" /><span><small>Episode {item.number}</small><strong>{item.title || `Episode ${item.number}`}</strong></span><em>{item.duration ? `${Math.ceil(item.duration / 60)}m` : ''}</em></button>)}</div>}
      </div>
    </div>
  </div>;
}

export default function App() {
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [selected, setSelected] = useState(null);
  const [episode, setEpisode] = useState(null);
  const [query, setQuery] = useState('');
  const [muted, setMuted] = useState(true);
  const heroVideo = useRef(null);
  useEffect(() => { loadCatalog().then(setCatalog); }, []);
  useEffect(() => { document.body.style.overflow = selected ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [selected]);
  const featured = catalog.shows.find((show) => show.id === catalog.featuredId) || catalog.shows[0];
  const filtered = useMemo(() => catalog.shows.filter((show) => show.title.toLowerCase().includes(query.toLowerCase())), [catalog, query]);
  const originals = filtered.filter((show) => show.source === 'bloomie');
  const dramas = filtered.filter((show) => show.source !== 'bloomie');
  const genres = [...new Set(dramas.map((show) => show.genre).filter((genre) => genre && genre !== 'Short drama'))].slice(0, 4);
  const open = (show, nextEpisode = null) => {
    const firstPlayable = show.episodes?.find((item) => item.videoUrl) || null;
    setSelected(show);
    setEpisode(nextEpisode?.videoUrl ? nextEpisode : firstPlayable);
  };

  return <div className="app-shell">
    <header><a className="brand" href="/">Bloomie <b>Watch</b></a><nav><a href="#home">Home</a><a href="#shows">Shows</a><a href="#originals">Originals</a></nav><label className="search"><span>⌕</span><input aria-label="Search shows" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} /></label></header>
    <main id="home">
      {featured && <section className="hero">
        <img src={featured.heroUrl || featured.coverUrl} alt="" />
        {featured.previewUrl && <video ref={heroVideo} src={featured.previewUrl} muted={muted} autoPlay loop playsInline poster={featured.heroUrl || featured.coverUrl} />}
        <span className="hero-vignette" />
        <div className="hero-copy"><p className="eyebrow">{featured.eyebrow || 'Featured Short Drama'}</p><h1>{featured.title}</h1><p>{featured.description}</p><div className="actions"><button className="primary" onClick={() => open(featured)}><PlayIcon /> Watch now</button><button className="secondary" onClick={() => open(featured)}>ⓘ More info</button></div><div className="meta"><span>{featured.year || '2026'}</span><span>{featured.genre || 'Short drama'}</span><span>{featured.episodes?.length || featured.episodeCount || 0} episodes</span></div></div>
        {featured.previewUrl && <button className="sound" onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn preview sound on' : 'Mute preview'}>{muted ? '⌁' : '♪'}</button>}
      </section>}
      <div id="shows" className="catalog">
        {query ? <Rail title={`Results for “${query}”`} shows={filtered} onOpen={open} /> : <><Rail title="Bloomie Originals" shows={originals} onOpen={open} /><Rail title="Short Dramas" shows={dramas} onOpen={open} />{genres.map((genre) => <Rail key={genre} title={genre} shows={dramas.filter((show) => show.genre === genre)} onOpen={open} />)}</>}
      </div>
    </main>
    <footer><strong>Bloomie Watch</strong><span>Original stories and short dramas, all in one place.</span></footer>
    <Player show={selected} episode={episode} onClose={() => setSelected(null)} onEpisode={setEpisode} />
  </div>;
}
