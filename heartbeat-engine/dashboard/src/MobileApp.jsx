import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const CORAL = '#E8845A';
const GREEN  = '#22C55E';

const THEMES = {
  light: {
    bg:         '#FFFFFF',
    sf:         '#FFFFFF',   // header / tab bar / input bar surface
    presenceBg: '#F5F5F5',   // 16:9 area
    inputBg:    '#F5F5F5',   // textarea wrapper
    agentBubble:'#FFFFFF',
    toolBubble: '#F5F5F5',
    border:     '#E5E7EB',
    textPri:    '#111827',
    textSec:    '#6B7280',
    textMut:    '#9CA3AF',
    userBubble: CORAL,
    userText:   '#FFFFFF',
    badgeBg:    '#FFFFFF',
  },
  dark: {
    bg:         '#0D0D0D',
    sf:         '#161616',   // header / tab bar / input bar surface
    presenceBg: '#111111',   // 16:9 area
    inputBg:    '#1E1E1E',   // textarea wrapper
    agentBubble:'#1E1E1E',
    toolBubble: '#1A1A1A',
    border:     '#2A2A2E',
    textPri:    '#F0F0F0',
    textSec:    '#9A9A9A',
    textMut:    '#555555',
    userBubble: CORAL,
    userText:   '#FFFFFF',
    badgeBg:    '#1E1E1E',
  },
};

const API = window.location.origin;

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session
    ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
    : { 'Content-Type': 'application/json' };
}

function ts() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function ini(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function getAgentParam() {
  return new URLSearchParams(window.location.search).get('agent');
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const ChevronLeftIcon = ({ color }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
  </svg>
);

const FolderIcon = ({ color }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ src, name, size = 36, radius = 10 }) {
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(135deg, ${CORAL}, #E76F8B)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#FFFFFF',
    }}>
      {ini(name)}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots({ c }) {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: '12px 16px',
      background: c.agentBubble, border: `1px solid ${c.border}`,
      borderRadius: '18px 18px 18px 4px', width: 'fit-content',
    }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: c.textMut,
          animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ─── Presence Area ────────────────────────────────────────────────────────────
// State: 'active' | 'idle' | 'speaking'
// Phase 2: replace placeholder with Ken Burns + Gemini images.
// Hooks onSpeakingStart / onSpeakingEnd are passed down for Phase 2 media player.
function PresenceArea({ agent, presenceState, c, onSpeakingStart, onSpeakingEnd }) {
  const stateLabel = { active: 'Active', idle: 'Idle', speaking: 'Speaking…' };
  const stateColor = { active: GREEN, idle: c.textMut, speaking: CORAL };
  const color = stateColor[presenceState] ?? c.textMut;

  return (
    <div style={{
      width: '100%', aspectRatio: '16/9',
      background: c.presenceBg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Phase 2 hook: Ken Burns container — drop <img> or <canvas> here */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />

      <Avatar src={agent?.avatar_url} name={agent?.name || 'B'} size={64} radius={20} />
      <div style={{ fontSize: 16, fontWeight: 700, color: c.textPri, marginTop: 12 }}>
        {agent?.name || 'Loading…'}
      </div>
      <div style={{ fontSize: 12, color: c.textSec, marginTop: 2 }}>
        {agent?.job_title || agent?.role || ''}
      </div>
      <div style={{
        marginTop: 10, display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 20,
        background: c.badgeBg, border: `1px solid ${c.border}`,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'block' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color }}>
          {stateLabel[presenceState] ?? 'Idle'}
        </span>
      </div>
    </div>
  );
}

// ─── Assets placeholder ───────────────────────────────────────────────────────
function AssetsTab({ c, agentName }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: '0 32px',
      background: c.bg,
    }}>
      <FolderIcon color={c.textMut} />
      <div style={{ fontSize: 14, fontWeight: 600, color: c.textSec }}>Assets — Phase 3</div>
      <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5, color: c.textMut }}>
        Files and deliverables from {agentName.split(' ')[0]} will appear here.
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function MobileLogin({ onLogin, c }) {
  const [email, setEmail] = useState('');
  const [pw,    setPw]    = useState('');
  const [err,   setErr]   = useState('');
  const [busy,  setBusy]  = useState(false);

  const go = async (e) => {
    e.preventDefault();
    if (!email || !pw) { setErr('Enter email and password'); return; }
    setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setErr(error.message); setBusy(false); return; }
    onLogin();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: c.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, paddingTop: 'max(24px, env(safe-area-inset-top))',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`html { background: ${c.bg} !important; } body { background: ${c.bg}; }`}</style>
      <div style={{
        width: 56, height: 56, borderRadius: 14, marginBottom: 16,
        background: `linear-gradient(135deg, ${CORAL}, #E76F8B)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 800, color: '#FFFFFF',
      }}>B</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: c.textPri, marginBottom: 4 }}>BLOOM</div>
      <div style={{ fontSize: 13, color: c.textSec, marginBottom: 32 }}>Sign in to chat with your Bloomie</div>
      <form onSubmit={go} style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={email} onChange={e => setEmail(e.target.value)}
          type="email" placeholder="Email" autoComplete="email"
          style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${c.border}`, background: c.inputBg, color: c.textPri, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
        />
        <input
          value={pw} onChange={e => setPw(e.target.value)}
          type="password" placeholder="Password" autoComplete="current-password"
          style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${c.border}`, background: c.inputBg, color: c.textPri, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
        />
        <button type="submit" disabled={busy} style={{
          padding: 14, borderRadius: 12, border: 'none',
          background: `linear-gradient(135deg, ${CORAL}, #E76F8B)`,
          color: '#FFFFFF', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        {err && <div style={{ fontSize: 13, color: '#EF4444', textAlign: 'center', marginTop: 4 }}>{err}</div>}
      </form>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN MOBILE APP
// ══════════════════════════════════════════════════════════════════════════════
export default function MobileApp({ user: authUser }) {
  const [dark, setDark] = useState(() => localStorage.getItem('bloom-mobile-theme') !== 'light');
  const c = dark ? THEMES.dark : THEMES.light;

  const [user,         setUser]         = useState(authUser || null);
  const [allAgents,    setAllAgents]    = useState([]);
  const [agent,        setAgent]        = useState(null);
  const [orgId,        setOrgId]        = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState('');
  const [sending,      setSending]      = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [initError,    setInitError]    = useState(null);
  const [tab,          setTab]          = useState('chat');
  const [presenceState,setPresenceState]= useState('idle');

  const chatEndRef = useRef(null);
  const sessionRef = useRef(null);
  const inputRef   = useRef(null);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('bloom-mobile-theme', next ? 'dark' : 'light');
  };

  // ── Phase 2 presence hooks (stubbed) ─────────────────────────────────────
  const onSpeakingStart = useCallback(() => setPresenceState('speaking'), []);
  const onSpeakingEnd   = useCallback(() => setPresenceState('active'),   []);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const h = await authHeaders();
        const res = await fetch(API + '/api/mobile/init', { headers: h });
        if (!res.ok) { setInitError('Failed to load: ' + res.status); setLoading(false); return; }
        const data = await res.json();

        if (data.org?.id) setOrgId(data.org.id);

        if (data.agents?.length) {
          setAllAgents(data.agents);

          const param = getAgentParam()?.toLowerCase();
          let active  = data.agents.find(a => a.id === data.assignedAgentId);
          if (param) {
            active =
              data.agents.find(a => a.id === param) ||
              data.agents.find(a => a.name.split(' ')[0].toLowerCase() === param) ||
              data.agents.find(a => a.name.toLowerCase().includes(param)) ||
              active ||
              data.agents[0];
          } else {
            active = active || data.agents[0];
          }

          setAgent(active);
          setPresenceState('active');
          sessionRef.current = 'mobile-' + active.id.slice(0, 8) + '-' + Date.now().toString(36);

          const agentMsgs = data.messages?.[active.id] || [];
          setMessages(agentMsgs.map(m => ({
            id:     m.id,
            isUser: m.role === 'user',
            text:   m.content,
            type:   'text',
            time:   new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          })));
        }
      } catch (e) {
        console.error('[BloomiePWA] Init error:', e);
        setInitError(e.message);
      }
      setLoading(false);
    })();
  }, [user]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);
    setPresenceState('speaking');
    setMessages(p => [...p, { id: 'u-' + Date.now(), isUser: true, text, type: 'text', time: ts() }]);

    try {
      const h    = await authHeaders();
      const body = { message: text, sessionId: sessionRef.current, agentId: agent?.id };
      if (orgId) body.organizationId = orgId;

      const r   = await fetch(API + '/api/chat/message', { method: 'POST', headers: h, body: JSON.stringify(body) });
      const d   = await r.json();
      const raw = d.response || d.message || 'Done.';
      const clean = raw.replace(/\s*\[Session context[\s\S]*$/, '').trim();

      setMessages(p => [...p, { id: 'a-' + Date.now(), isUser: false, text: clean, type: 'text', time: ts() }]);
    } catch {
      setMessages(p => [...p, { id: 'e-' + Date.now(), isUser: false, text: 'Something went wrong. Try again.', type: 'text', time: ts() }]);
    }

    setSending(false);
    setPresenceState('active');
    inputRef.current?.focus();
  }, [input, sending, agent, orgId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); };

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!user) {
    return (
      <MobileLogin
        c={c}
        onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user))}
      />
    );
  }

  const agentName = agent?.name || 'Bloomie';
  const agentRole = agent?.job_title || agent?.role || 'AI Employee';
  const isOnline  = presenceState !== 'idle';

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: c.bg,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      overflow: 'hidden',
      paddingTop:   'env(safe-area-inset-top)',
      paddingLeft:  'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { padding: 0 !important; min-height: 100vh !important; background: ${c.bg} !important; overflow: hidden !important; }
        body { margin: 0; padding: 0; overflow: hidden; height: 100vh; background: ${c.bg}; overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch; }
        #root { height: 100vh; overflow: hidden; }
        @keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
        input:focus, textarea:focus { outline: none; }
        ::-webkit-scrollbar { width: 0; }
        button { -webkit-user-select: none; user-select: none; }
        textarea { overflow-y: auto; }
        ::placeholder { color: ${c.textMut}; opacity: 1; }
      `}</style>

      {/* ═══ HEADER (48px) ════════════════════════════════════════════════════ */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center',
        paddingLeft: 4, paddingRight: 12,
        background: c.sf, borderBottom: `1px solid ${c.border}`,
        flexShrink: 0, position: 'relative',
      }}>
        {/* Back arrow */}
        <button
          onClick={() => window.history.back()}
          aria-label="Back"
          style={{ width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <ChevronLeftIcon color={c.textPri} />
        </button>

        {/* Centered name + role */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.textPri, lineHeight: 1.2 }}>{agentName}</div>
          <div style={{ fontSize: 10, color: c.textSec, lineHeight: 1.2 }}>{agentRole}</div>
        </div>

        {/* Right side: status + theme toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? GREEN : c.textMut, display: 'block' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: isOnline ? GREEN : c.textMut }}>
              {isOnline ? 'Active' : 'Idle'}
            </span>
          </div>

          {/* Dark / light toggle */}
          <button
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              width: 30, height: 30, borderRadius: 8, border: `1px solid ${c.border}`,
              background: c.inputBg, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: c.textSec, flexShrink: 0,
            }}
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>

      {/* ═══ 16:9 PRESENCE AREA ══════════════════════════════════════════════ */}
      <PresenceArea
        agent={agent}
        presenceState={presenceState}
        c={c}
        onSpeakingStart={onSpeakingStart}
        onSpeakingEnd={onSpeakingEnd}
      />

      {/* ═══ TAB TOGGLE ══════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', background: c.sf, borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        {[
          { key: 'chat',   label: '💬 Chat'   },
          { key: 'assets', label: '📁 Assets' },
        ].map(({ key, label }) => {
          const active = tab === key;
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, height: 40, border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              color: active ? CORAL : c.textMut,
              borderBottom: `2px solid ${active ? CORAL : 'transparent'}`,
            }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ═══ TAB CONTENT ═════════════════════════════════════════════════════ */}
      {tab === 'assets' ? (
        <AssetsTab c={c} agentName={agentName} />
      ) : (
        <>
          {/* Chat thread */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '14px 12px 8px',
            display: 'flex', flexDirection: 'column', gap: 6,
            background: c.bg,
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: c.textMut, fontSize: 13, marginTop: 40 }}>Loading…</div>
            ) : initError ? (
              <div style={{ textAlign: 'center', color: '#EF4444', fontSize: 13, marginTop: 40 }}>{initError}</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: 40, padding: '0 24px' }}>
                <Avatar src={agent?.avatar_url} name={agentName} size={52} radius={16} />
                <div style={{ fontSize: 15, fontWeight: 600, color: c.textPri, marginTop: 12, marginBottom: 4 }}>
                  Chat with {agentName.split(' ')[0]}
                </div>
                <div style={{ fontSize: 13, color: c.textSec, lineHeight: 1.5 }}>
                  Send a message to get started.
                </div>
              </div>
            ) : (
              messages.map(msg => {
                // Tool activity bubble
                if (msg.type === 'tool') {
                  return (
                    <div key={msg.id} style={{ display: 'flex', padding: '2px 0 2px 32px' }}>
                      <div style={{
                        padding: '8px 12px', borderRadius: 10,
                        background: c.toolBubble, border: `1px solid ${c.border}`,
                        fontFamily: 'monospace', fontSize: 11, color: c.textSec,
                        lineHeight: 1.4, maxWidth: '85%',
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                // Standard message bubble
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.isUser ? 'flex-end' : 'flex-start', padding: '2px 0' }}>
                    {!msg.isUser && (
                      <div style={{ marginRight: 6, flexShrink: 0, alignSelf: 'flex-end' }}>
                        <Avatar src={agent?.avatar_url} name={agentName} size={26} radius={7} />
                      </div>
                    )}
                    <div style={{ maxWidth: '78%' }}>
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: msg.isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        background: msg.isUser ? c.userBubble : c.agentBubble,
                        border: msg.isUser ? 'none' : `1px solid ${c.border}`,
                        color: msg.isUser ? c.userText : c.textPri,
                        fontSize: 14, lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {msg.text}
                        <div style={{
                          fontSize: 10,
                          color: msg.isUser ? 'rgba(255,255,255,0.6)' : c.textMut,
                          marginTop: 4,
                          textAlign: msg.isUser ? 'right' : 'left',
                        }}>
                          {msg.time}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing indicator */}
            {sending && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '2px 0' }}>
                <Avatar src={agent?.avatar_url} name={agentName} size={26} radius={7} />
                <TypingDots c={c} />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ═══ STICKY INPUT BAR ════════════════════════════════════════════ */}
          <div style={{ borderTop: `1px solid ${c.border}`, background: c.sf, flexShrink: 0 }}>
            <div style={{ padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                border: `1px solid ${c.border}`, borderRadius: 24,
                background: c.inputBg, padding: '6px 6px 6px 14px',
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${agentName.split(' ')[0]}…`}
                  rows={1}
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    color: c.textPri, fontSize: 15, fontFamily: 'inherit',
                    resize: 'none', lineHeight: 1.4, maxHeight: 96,
                    padding: '2px 0', outline: 'none',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  aria-label="Send"
                  style={{
                    width: 36, height: 36, borderRadius: 18, border: 'none', flexShrink: 0,
                    background: (!input.trim() || sending) ? c.textMut : CORAL,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: (!input.trim() || sending) ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
