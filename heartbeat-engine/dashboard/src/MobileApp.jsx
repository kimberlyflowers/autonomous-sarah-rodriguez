import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';

// ─── Design tokens ───────────────────────────────────────────────────────────
const CORAL    = '#E8845A';
const WHITE    = '#FFFFFF';
const BG_SEC   = '#F5F5F5';
const BORDER   = '#E5E7EB';
const TEXT_PRI = '#111827';
const TEXT_SEC = '#6B7280';
const TEXT_MUT = '#9CA3AF';
const GREEN    = '#22C55E';

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

// ─── URL param helper ─────────────────────────────────────────────────────────
function getAgentParam() {
  return new URLSearchParams(window.location.search).get('agent');
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const ChevronLeftIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEXT_PRI} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const ChatIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ src, name, size = 36, radius = 10 }) {
  if (src) {
    return (
      <img src={src} alt={name} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(135deg, ${CORAL}, #E76F8B)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: WHITE,
    }}>
      {ini(name)}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{
      display: 'flex', gap: 4, padding: '12px 16px',
      background: WHITE, border: `1px solid ${BORDER}`,
      borderRadius: '18px 18px 18px 4px', width: 'fit-content',
    }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: TEXT_MUT,
          animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ─── Presence Area ────────────────────────────────────────────────────────────
// Phase 2 will add Ken Burns + Gemini images.
// State: 'active' | 'idle' | 'speaking'
function PresenceArea({ agent, presenceState, onSpeakingStart, onSpeakingEnd }) {
  const stateLabel = { active: 'Active', idle: 'Idle', speaking: 'Speaking…' };
  const stateColor = { active: GREEN, idle: TEXT_MUT, speaking: CORAL };

  return (
    <div style={{
      width: '100%', aspectRatio: '16/9', background: BG_SEC,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      position: 'relative', flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Phase 2 hook: Ken Burns container */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.04 }}>
        {/* Phase 2: background imagery goes here */}
      </div>

      <Avatar src={agent?.avatar_url} name={agent?.name || 'B'} size={64} radius={20} />
      <div style={{ fontSize: 16, fontWeight: 700, color: TEXT_PRI, marginTop: 12 }}>
        {agent?.name || 'Loading…'}
      </div>
      <div style={{ fontSize: 12, color: TEXT_SEC, marginTop: 2 }}>
        {agent?.job_title || agent?.role || ''}
      </div>

      {/* State badge */}
      <div style={{
        marginTop: 10, display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 20, background: WHITE,
        border: `1px solid ${BORDER}`,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: stateColor[presenceState] || stateColor.idle, display: 'block' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: stateColor[presenceState] || TEXT_SEC }}>
          {stateLabel[presenceState] || 'Idle'}
        </span>
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function MobileLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
      position: 'fixed', inset: 0, background: WHITE,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, paddingTop: 'max(24px, env(safe-area-inset-top))',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <style>{`html { background: ${WHITE} !important; } body { background: ${WHITE}; }`}</style>
      <div style={{
        width: 56, height: 56, borderRadius: 14, marginBottom: 16,
        background: `linear-gradient(135deg, ${CORAL}, #E76F8B)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 800, color: WHITE,
      }}>B</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: TEXT_PRI, marginBottom: 4 }}>BLOOM</div>
      <div style={{ fontSize: 13, color: TEXT_SEC, marginBottom: 32 }}>Sign in to chat with your Bloomie</div>
      <form onSubmit={go} style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          value={email} onChange={e => setEmail(e.target.value)}
          type="email" placeholder="Email" autoComplete="email"
          style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${BORDER}`, background: BG_SEC, color: TEXT_PRI, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
        />
        <input
          value={pw} onChange={e => setPw(e.target.value)}
          type="password" placeholder="Password" autoComplete="current-password"
          style={{ padding: '14px 16px', borderRadius: 12, border: `1px solid ${BORDER}`, background: BG_SEC, color: TEXT_PRI, fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
        />
        <button type="submit" disabled={busy} style={{
          padding: 14, borderRadius: 12, border: 'none',
          background: `linear-gradient(135deg, ${CORAL}, #E76F8B)`,
          color: WHITE, fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
          cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
        }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
        {err && <div style={{ fontSize: 13, color: '#EF4444', textAlign: 'center', marginTop: 4 }}>{err}</div>}
      </form>
    </div>
  );
}

// ─── Assets placeholder ───────────────────────────────────────────────────────
function AssetsTab() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 8, padding: '0 32px', color: TEXT_MUT,
    }}>
      <FolderIcon />
      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_SEC }}>Assets — Phase 3</div>
      <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
        Files and deliverables from {'\u00a0'}Sarah will appear here.
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN MOBILE APP
// ══════════════════════════════════════════════════════════════════════════════
export default function MobileApp({ user: authUser }) {
  const [user, setUser] = useState(authUser || null);
  const [allAgents, setAllAgents] = useState([]);
  const [agent, setAgent] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(null);
  const [tab, setTab] = useState('chat'); // 'chat' | 'assets'
  const [presenceState, setPresenceState] = useState('idle'); // 'active' | 'idle' | 'speaking'

  const chatEndRef = useRef(null);
  const sessionRef = useRef(null);
  const inputRef = useRef(null);

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

  // ── Init: load agents + messages ──────────────────────────────────────────
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

          // Resolve ?agent= URL param
          const param = getAgentParam()?.toLowerCase();
          let active = data.agents.find(a => data.assignedAgentId === a.id);
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
            id: m.id,
            isUser: m.role === 'user',
            text: m.content,
            type: 'text',
            time: new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
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
      const h = await authHeaders();
      const body = {
        message: text,
        sessionId: sessionRef.current,
        agentId: agent?.id,
      };
      if (orgId) body.organizationId = orgId;

      const r = await fetch(API + '/api/chat/message', { method: 'POST', headers: h, body: JSON.stringify(body) });
      const d = await r.json();
      const raw = d.response || d.message || 'Done.';

      // Strip session context noise
      const clean = raw
        .replace(/\s*\[Session context[\s\S]*$/, '')
        .trim();

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

  // ── Sign out ──────────────────────────────────────────────────────────────
  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); };

  // ── Render: unauthenticated ───────────────────────────────────────────────
  if (!user) {
    return (
      <MobileLogin onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user))} />
    );
  }

  const agentName = agent?.name || 'Bloomie';
  const agentRole = agent?.job_title || agent?.role || 'AI Employee';
  const isOnline   = presenceState !== 'idle';

  // ── Render: main screen ───────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: WHITE,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top)',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { padding: 0 !important; min-height: 100vh !important; background: ${WHITE} !important; overflow: hidden !important; }
        body { margin: 0; padding: 0; overflow: hidden; height: 100vh; background: ${WHITE}; overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch; }
        #root { height: 100vh; overflow: hidden; }
        @keyframes typingBounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
        input:focus, textarea:focus { outline: none; }
        ::-webkit-scrollbar { width: 0; }
        button { -webkit-user-select: none; user-select: none; }
        textarea { overflow-y: auto; }
      `}</style>

      {/* ═══ HEADER (48px) ════════════════════════════════════════════════════ */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center', paddingLeft: 8, paddingRight: 16,
        background: WHITE, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, position: 'relative',
      }}>
        {/* Back arrow */}
        <button
          onClick={() => window.history.back()}
          style={{ width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          aria-label="Back"
        >
          <ChevronLeftIcon />
        </button>

        {/* Centered name + role */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TEXT_PRI, lineHeight: 1.2 }}>{agentName}</div>
          <div style={{ fontSize: 10, color: TEXT_SEC, lineHeight: 1.2 }}>{agentRole}</div>
        </div>

        {/* Status dot + label */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? GREEN : TEXT_MUT, display: 'block' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: isOnline ? GREEN : TEXT_MUT }}>
            {isOnline ? 'Active' : 'Idle'}
          </span>
        </div>
      </div>

      {/* ═══ 16:9 PRESENCE AREA ══════════════════════════════════════════════ */}
      <PresenceArea
        agent={agent}
        presenceState={presenceState}
        onSpeakingStart={onSpeakingStart}
        onSpeakingEnd={onSpeakingEnd}
      />

      {/* ═══ TAB TOGGLE ══════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', background: WHITE, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {[
          { key: 'chat',   label: '💬 Chat'   },
          { key: 'assets', label: '📁 Assets' },
        ].map(({ key, label }) => {
          const active = tab === key;
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, height: 40, border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              color: active ? CORAL : TEXT_MUT,
              borderBottom: `2px solid ${active ? CORAL : 'transparent'}`,
            }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ═══ TAB CONTENT ═════════════════════════════════════════════════════ */}
      {tab === 'assets' ? (
        <AssetsTab />
      ) : (
        <>
          {/* Chat thread */}
          <div
            style={{
              flex: 1, overflowY: 'auto', padding: '14px 12px 8px',
              display: 'flex', flexDirection: 'column', gap: 6,
              background: WHITE,
            }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', color: TEXT_MUT, fontSize: 13, marginTop: 40 }}>Loading…</div>
            ) : initError ? (
              <div style={{ textAlign: 'center', color: '#EF4444', fontSize: 13, marginTop: 40 }}>{initError}</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: 40, padding: '0 24px' }}>
                <Avatar src={agent?.avatar_url} name={agentName} size={52} radius={16} />
                <div style={{ fontSize: 15, fontWeight: 600, color: TEXT_PRI, marginTop: 12, marginBottom: 4 }}>
                  Chat with {agentName.split(' ')[0]}
                </div>
                <div style={{ fontSize: 13, color: TEXT_SEC, lineHeight: 1.5 }}>
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
                        background: BG_SEC, border: `1px solid ${BORDER}`,
                        fontFamily: 'monospace', fontSize: 11, color: TEXT_SEC,
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
                        background: msg.isUser ? CORAL : WHITE,
                        border: msg.isUser ? 'none' : `1px solid ${BORDER}`,
                        color: msg.isUser ? WHITE : TEXT_PRI,
                        fontSize: 14, lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      }}>
                        {msg.text}
                        <div style={{
                          fontSize: 10,
                          color: msg.isUser ? 'rgba(255,255,255,0.65)' : TEXT_MUT,
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
                <TypingDots />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* ═══ STICKY INPUT BAR ════════════════════════════════════════════ */}
          <div style={{
            borderTop: `1px solid ${BORDER}`, background: WHITE, flexShrink: 0,
          }}>
            <div style={{
              padding: '8px 12px',
              paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
            }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                border: `1px solid ${BORDER}`, borderRadius: 24,
                background: BG_SEC, padding: '6px 6px 6px 14px',
              }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    // Auto-resize: reset then expand up to 4 lines (~96px)
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${agentName.split(' ')[0]}…`}
                  rows={1}
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    color: TEXT_PRI, fontSize: 15, fontFamily: 'inherit',
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
                    background: (!input.trim() || sending) ? TEXT_MUT : CORAL,
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
