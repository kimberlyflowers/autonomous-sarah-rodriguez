import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fallbackCatalog, loadCatalog } from './catalog.js';
import { googleOAuthEnabled, sendMagicLink, signInWithGoogle, supabase } from './supabase.js';

const PlayIcon = () => <span aria-hidden="true">▶</span>;

function ShowCard({ show, onOpen }) {
  const video = useRef(null);
  const playableCount = show.episodes?.filter((episode) => episode.videoUrl).length || 0;
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
      <span className={`availability-badge ${playableCount ? 'ready' : ''}`}>{playableCount ? `${playableCount} ready` : 'Uploading'}</span>
      <span className="card-shade" />
      <span className="card-copy"><strong>{show.title}</strong><small>{playableCount ? `${playableCount} playable episode${playableCount === 1 ? '' : 's'}` : `${show.episodeCount || 0} episodes queued`}</small></span>
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

function Player({ show, episode, onClose, onEpisode, user, isFavorite, onFavorite, progress, onProgress }) {
  const video = useRef(null);
  const touchStart = useRef(null);
  const wheelLocked = useRef(false);
  const lastSaved = useRef(0);
  const playable = useMemo(() => show?.episodes?.filter((item) => item.videoUrl) || [], [show]);
  const active = episode?.videoUrl ? episode : playable[0];
  const activeIndex = playable.findIndex((item) => item.id === active?.id);
  const savedProgress = active ? progress?.[show.id] : null;
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
  const restoreProgress = () => {
    if (!video.current || savedProgress?.episode_id !== active?.id || !savedProgress.position_seconds) return;
    if (video.current.currentTime < 1) video.current.currentTime = savedProgress.position_seconds;
  };
  const saveProgress = (completed = false) => {
    if (!user || !active || !video.current) return;
    const position = completed ? 0 : Math.max(0, Math.floor(video.current.currentTime));
    const now = Date.now();
    if (!completed && now - lastSaved.current < 10000) return;
    lastSaved.current = now;
    onProgress(show.id, active.id, position, completed);
  };
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
          {active?.videoUrl ? <video ref={video} key={active.id} controls autoPlay playsInline poster={active.thumbnailUrl || show.coverUrl} src={active.videoUrl} onLoadedMetadata={restoreProgress} onTimeUpdate={() => saveProgress(false)} onPause={() => saveProgress(false)} onEnded={() => { saveProgress(true); move(1); }} /> : <img src={show.coverUrl} alt={`${show.title} cover`} />}
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
        <button className={`list-toggle ${isFavorite ? 'active' : ''}`} onClick={() => onFavorite(show)}>{isFavorite ? '✓ In My List' : '+ My List'}</button>
        <p>{show.description}</p>
        <div className="meta"><span>{show.year || '2026'}</span><span>{show.genre || 'Short drama'}</span><span>{show.episodes?.length || show.episodeCount || 0} episodes</span></div>
        {!playable.length && <p className="availability">This show is organized and ready. Its episode videos are still being uploaded.</p>}
        {playable.length > 0 && <div className="episode-list">{playable.map((item) => <button className={item.id === active?.id ? 'active' : ''} key={item.id} onClick={() => onEpisode(item)}><img src={item.thumbnailUrl || show.coverUrl} alt="" loading="lazy" /><span><small>Episode {item.number}</small><strong>{item.title || `Episode ${item.number}`}</strong></span><em>{item.duration ? `${Math.ceil(item.duration / 60)}m` : ''}</em></button>)}</div>}
      </div>
    </div>
  </div>;
}

function AccountModal({ user, onClose }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (action) => {
    setBusy(true); setMessage('');
    const { error } = await action();
    setBusy(false);
    if (error) setMessage(error.message);
  };
  const submitEmail = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    const { error } = await sendMagicLink(email);
    setBusy(false);
    setMessage(error ? error.message : 'Check your email for your secure sign-in link.');
  };
  return <div className="account-backdrop" role="dialog" aria-modal="true" aria-label="Bloomie Watch account" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="account-panel">
      <button className="close" onClick={onClose} aria-label="Close account">×</button>
      <p className="eyebrow">Bloomie Watch</p>
      {user ? <>
        <h2>Welcome back</h2>
        <p>{user.user_metadata?.full_name || user.email}</p>
        <p className="account-note">Your list and watch progress stay private and sync across devices.</p>
        <button className="auth-button" disabled={busy} onClick={() => run(() => supabase.auth.signOut())}>Sign out</button>
      </> : <>
        <h2>Save your place</h2>
        <p className="account-note">Watching is always free. Sign in only if you want My List and synced progress.</p>
        {googleOAuthEnabled && <><button className="auth-button google" disabled={busy} onClick={() => run(signInWithGoogle)}>Continue with Google</button><div className="auth-divider"><span>or</span></div></>}
        <form onSubmit={submitEmail}>
          <label>Email address<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
          <button className="auth-button" disabled={busy}>Email me a sign-in link</button>
        </form>
      </>}
      {message && <p className="auth-message" role="status">{message}</p>}
    </div>
  </div>;
}

export default function App() {
  const [catalog, setCatalog] = useState(fallbackCatalog);
  const [selected, setSelected] = useState(null);
  const [episode, setEpisode] = useState(null);
  const [query, setQuery] = useState('');
  const [muted, setMuted] = useState(true);
  const [user, setUser] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [progress, setProgress] = useState({});
  const heroVideo = useRef(null);
  useEffect(() => { loadCatalog().then(setCatalog); }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user) { setFavorites(new Set()); setProgress({}); return; }
    supabase.from('bloomie_watch_profiles').upsert({ user_id: user.id, display_name: user.user_metadata?.full_name || null, avatar_url: user.user_metadata?.avatar_url || null }).then(() => {});
    Promise.all([
      supabase.from('bloomie_watch_favorites').select('show_id'),
      supabase.from('bloomie_watch_progress').select('show_id,episode_id,position_seconds,completed,updated_at'),
    ]).then(([favoriteResult, progressResult]) => {
      if (!favoriteResult.error) setFavorites(new Set((favoriteResult.data || []).map((item) => item.show_id)));
      if (!progressResult.error) setProgress(Object.fromEntries((progressResult.data || []).map((item) => [item.show_id, item])));
    });
  }, [user]);
  useEffect(() => { document.body.style.overflow = selected ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [selected]);
  const featured = catalog.shows.find((show) => show.id === catalog.featuredId) || catalog.shows[0];
  const filtered = useMemo(() => catalog.shows.filter((show) => show.title.toLowerCase().includes(query.toLowerCase())), [catalog, query]);
  const originals = filtered.filter((show) => show.source === 'bloomie');
  const dramas = filtered.filter((show) => show.source !== 'bloomie');
  const readyDramas = dramas.filter((show) => show.episodes?.some((episode) => episode.videoUrl)).sort((a, b) => b.episodes.length - a.episodes.length);
  const myList = filtered.filter((show) => favorites.has(show.id));
  const genreOrder = ['Romance', 'Business & CEOs', 'Revenge & Redemption', 'Family Secrets', 'Hidden Identities', 'Fantasy & Royalty', 'Werewolf & Supernatural', 'Horror & Dark Fantasy', 'Crime & Mafia', 'Action & Adventure', 'Urban & Slice of Life', 'Medical Drama', 'Comedy & Feel-Good', 'Drama', 'Uncategorized'];
  const genreRows = useMemo(() => {
    const grouped = dramas.reduce((rows, show) => {
      const genres = show.genres?.length ? show.genres : [show.genre || 'Romance & Drama'];
      genres.forEach((genre) => {
        if (!rows.has(genre)) rows.set(genre, []);
        rows.get(genre).push(show);
      });
      return rows;
    }, new Map());
    return [...grouped.entries()].sort(([left, leftShows], [right, rightShows]) => {
      const leftOrder = genreOrder.indexOf(left);
      const rightOrder = genreOrder.indexOf(right);
      if (leftOrder !== rightOrder) return (leftOrder < 0 ? 99 : leftOrder) - (rightOrder < 0 ? 99 : rightOrder);
      return rightShows.length - leftShows.length || left.localeCompare(right);
    });
  }, [dramas]);
  const open = (show, nextEpisode = null) => {
    const firstPlayable = show.episodes?.find((item) => item.videoUrl) || null;
    const saved = progress[show.id];
    const savedEpisode = saved ? show.episodes?.find((item) => item.id === saved.episode_id && item.videoUrl) : null;
    setSelected(show);
    setEpisode(nextEpisode?.videoUrl ? nextEpisode : savedEpisode || firstPlayable);
  };
  const toggleFavorite = async (show) => {
    if (!user) { setAccountOpen(true); return; }
    const active = favorites.has(show.id);
    const result = active
      ? await supabase.from('bloomie_watch_favorites').delete().eq('user_id', user.id).eq('show_id', show.id)
      : await supabase.from('bloomie_watch_favorites').insert({ user_id: user.id, show_id: show.id });
    if (result.error) return;
    setFavorites((current) => { const next = new Set(current); active ? next.delete(show.id) : next.add(show.id); return next; });
  };
  const saveProgress = async (showId, episodeId, positionSeconds, completed) => {
    if (!user) return;
    const row = { user_id: user.id, show_id: showId, episode_id: episodeId, position_seconds: positionSeconds, completed, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('bloomie_watch_progress').upsert(row, { onConflict: 'user_id,show_id' });
    if (!error) setProgress((current) => ({ ...current, [showId]: row }));
  };

  return <div className="app-shell">
    <header><a className="brand" href="/">Bloomie <b>Watch</b></a><nav><a href="#home">Home</a><a href="#shows">Shows</a><a href="#originals">Originals</a>{user && <a href="#my-list">My List</a>}</nav><label className="search"><span>⌕</span><input aria-label="Search shows" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className="account-button" onClick={() => setAccountOpen(true)}>{user ? (user.user_metadata?.full_name?.split(' ')[0] || 'Account') : 'Sign in'}</button></header>
    <main id="home">
      {featured && <section className="hero">
        <img src={featured.heroUrl || featured.coverUrl} alt="" />
        {featured.previewUrl && <video ref={heroVideo} src={featured.previewUrl} muted={muted} autoPlay loop playsInline poster={featured.heroUrl || featured.coverUrl} />}
        <span className="hero-vignette" />
        <div className="hero-copy"><p className="eyebrow">{featured.eyebrow || 'Featured Short Drama'}</p><h1>{featured.title}</h1><p>{featured.description}</p><div className="actions"><button className="primary" onClick={() => open(featured)}><PlayIcon /> Watch now</button><button className="secondary" onClick={() => open(featured)}>ⓘ More info</button></div><div className="meta"><span>{featured.year || '2026'}</span><span>{featured.genre || 'Short drama'}</span><span>{featured.episodes?.length || featured.episodeCount || 0} episodes</span></div></div>
        {featured.previewUrl && <button className="sound" onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn preview sound on' : 'Mute preview'}>{muted ? '⌁' : '♪'}</button>}
      </section>}
      <div id="shows" className="catalog">
        {query ? <Rail title={`Results for “${query}”`} shows={filtered} onOpen={open} /> : <>{user && <div id="my-list"><Rail title="My List" shows={myList} onOpen={open} /></div>}<Rail title="Ready to Watch" shows={readyDramas} onOpen={open} /><Rail title="Bloomie Originals" shows={originals} onOpen={open} />{genreRows.map(([genre, shows]) => <Rail key={genre} title={genre} shows={shows} onOpen={open} />)}</>}
      </div>
    </main>
    <footer><strong>Bloomie Watch</strong><span>Original stories and short dramas, all in one place.</span></footer>
    <Player show={selected} episode={episode} onClose={() => setSelected(null)} onEpisode={setEpisode} user={user} isFavorite={favorites.has(selected?.id)} onFavorite={toggleFavorite} progress={progress} onProgress={saveProgress} />
    {accountOpen && <AccountModal user={user} onClose={() => setAccountOpen(false)} />}
  </div>;
}
