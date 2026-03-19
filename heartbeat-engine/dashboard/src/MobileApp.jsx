import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';

// ── THEME ──────────────────────────────────────────────────────────────
const themes = {
  dark: {
    bg: '#0d0d0d', sf: '#1a1a1a', card: '#1e1e1e', border: '#2a2a2e',
    tx: '#f0f0f0', sub: '#999', muted: '#555', accent: '#F4A261', accent2: '#E76F8B',
    gradient: 'linear-gradient(135deg, #F4A261, #E76F8B)',
    userBubble: 'linear-gradient(135deg, #F4A261, #E76F8B)',
    agentBubble: '#1e1e1e', agentBorder: '#2a2a2e',
    input: '#1a1a1a', inputBorder: '#2a2a2e',
  },
  light: {
    bg: '#f7f5f2', sf: '#ffffff', card: '#ffffff', border: '#e5e5e5',
    tx: '#111', sub: '#666', muted: '#aaa', accent: '#F4A261', accent2: '#E76F8B',
    gradient: 'linear-gradient(135deg, #F4A261, #E76F8B)',
    userBubble: 'linear-gradient(135deg, #F4A261, #E76F8B)',
    agentBubble: '#ffffff', agentBorder: '#e5e5e5',
    input: '#ffffff', inputBorder: '#e5e5e5',
  },
};

const SARAH_URL = window.location.origin;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { 'Content-Type': 'application/json' };
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` };
}

// ── MOBILE LOGIN ───────────────────────────────────────────────────────
function MobileLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) { setError('Enter your email and password'); return; }
    setError(''); setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    onLogin();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d0d0d', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: 'linear-gradient(135deg, #F4A261, #E76F8B)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 16 }}>B</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#f0f0f0', marginBottom: 4 }}>BLOOM</div>
      <div style={{ fontSize: 13, color: '#666', marginBottom: 32 }}>Sign in to chat with your Bloomie</div>
      <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" autoComplete="email"
          style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #2a2a2e', background: '#1a1a1a', color: '#f0f0f0', fontSize: 15, fontFamily: 'inherit', outline: 'none' }} />
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Password" autoComplete="current-password"
          style={{ padding: '14px 16px', borderRadius: 12, border: '1px solid #2a2a2e', background: '#1a1a1a', color: '#f0f0f0', fontSize: 15, fontFamily: 'inherit', outline: 'none' }} />
        <button type="submit" disabled={loading}
          style={{ padding: 14, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #F4A261, #E76F8B)', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
        {error && <div style={{ fontSize: 13, color: '#ef4444', textAlign: 'center', marginTop: 4 }}>{error}</div>}
      </form>
    </div>
  );
}

// ── TYPING INDICATOR ───────────────────────────────────────────────────
function TypingDots({ c }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '12px 16px', background: c.agentBubble, border: '1px solid ' + c.agentBorder, borderRadius: '18px 18px 18px 4px', width: 'fit-content' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c.muted, animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
      ))}
    </div>
  );
}

// ── MAIN MOBILE APP ────────────────────────────────────────────────────
export default function MobileApp({ user: authUser }) {
  const [dark, setDark] = useState(() => localStorage.getItem('bloom-mobile-theme') !== 'light');
  const c = dark ? themes.dark : themes.light;
  const [tab, setTab] = useState('text');
  const [user, setUser] = useState(authUser || null);
  const [agent, setAgent] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef(null);
  const sessionRef = useRef('mobile-' + Date.now());
  const inputRef = useRef(null);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('bloom-mobile-theme', next ? 'dark' : 'light');
  };

  // ── Auth check ──
  useEffect(() => {
    if (user) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load agent + messages ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data: mem } = await supabase.from('organization_members')
          .select('organization_id').eq('user_id', user.id).limit(1).single();
        const oid = mem?.organization_id;
        if (oid) setOrgId(oid);

        let agentData = null;
        if (oid) {
          const { data: assignment } = await supabase.from('agent_assignments')
            .select('agent_id, agents(id, name, role, avatar_url)')
            .eq('organization_id', oid).eq('active', true).limit(1).single();
          if (assignment?.agents) agentData = assignment.agents;
        }
        if (!agentData && oid) {
          const { data: fallback } = await supabase.from('agents')
            .select('id, name, role, avatar_url').eq('organization_id', oid).limit(1).single();
          if (fallback) agentData = fallback;
        }
        if (agentData) setAgent(agentData);

        if (agentData && oid) {
          const { data: msgs } = await supabase.from('messages')
            .select('id, role, content, created_at')
            .eq('agent_id', agentData.id)
            .order('created_at', { ascending: false })
            .limit(50);
          if (msgs) {
            setMessages(msgs.reverse().map(m => ({
              id: m.id, isUser: m.role === 'user', text: m.content,
              time: new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
            })));
          }
        }
      } catch (e) { console.error('Mobile init error:', e); }
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(''); setSending(true);
    setMessages(prev => [...prev, { id: 'u-' + Date.now(), isUser: true, text, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }]);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(SARAH_URL + '/api/chat/message', {
        method: 'POST', headers,
        body: JSON.stringify({ message: text, sessionId: sessionRef.current, agentId: agent?.id }),
      });
      const data = await res.json();
      const responseText = (data.response || data.message || 'Done.').replace(/\s*\[Session context[\s\S]*$/, '').replace(/\s*\[Tool:.*?\]\s*/g, '').trim();
      setMessages(prev => [...prev, { id: 'a-' + Date.now(), isUser: false, text: responseText, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: 'e-' + Date.now(), isUser: false, text: 'Sorry, something went wrong. Please try again.', time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }]);
    }
    setSending(false);
    inputRef.current?.focus();
  }, [input, sending, agent]);

  const handleSignOut = async () => { await supabase.auth.signOut(); setUser(null); };

  if (!user) return <MobileLogin onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user))} />;

  const agentName = agent?.name || 'Your Bloomie';
  const agentInitials = agentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ minHeight: '100vh', maxHeight: '100vh', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', system-ui, sans-serif", overflow: 'hidden', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { margin: 0; overflow: hidden; }
        @keyframes typingBounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
        input:focus, textarea:focus { outline: none; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid ' + c.border, background: c.sf, flexShrink: 0 }}>
        {agent?.avatar_url
          ? <img src={agent.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
          : <div style={{ width: 36, height: 36, borderRadius: 10, background: c.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{agentInitials}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agentName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34a853' }} />
            <span style={{ fontSize: 11, color: '#34a853', fontWeight: 600 }}>Online</span>
          </div>
        </div>
        <button onClick={toggleTheme} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid ' + c.border, background: c.card, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14 }}>
          {dark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
        </button>
        <button onClick={handleSignOut} style={{ fontSize: 11, color: c.muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid ' + c.border, background: c.sf, flexShrink: 0 }}>
        {['Text', 'Call', 'Conference'].map(t => {
          const active = tab === t.toLowerCase();
          return (<button key={t} onClick={() => setTab(t.toLowerCase())}
            style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: '2px solid ' + (active ? c.accent : 'transparent'), color: active ? c.accent : c.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}>{t}</button>);
        })}
      </div>

      {/* CONTENT */}
      {tab === 'text' ? (<>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (<div style={{ textAlign: 'center', color: c.muted, fontSize: 13, marginTop: 40 }}>Loading messages...</div>)
           : messages.length === 0 ? (
            <div style={{ textAlign: 'center', marginTop: 60, padding: '0 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: c.tx, marginBottom: 4 }}>Chat with {agentName.split(' ')[0]}</div>
              <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.5 }}>Send a message to get started. Your Bloomie is ready to help.</div>
            </div>)
           : messages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.isUser ? 'flex-end' : 'flex-start', padding: '2px 0' }}>
              <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: msg.isUser ? c.userBubble : c.agentBubble, border: msg.isUser ? 'none' : '1px solid ' + c.agentBorder, color: msg.isUser ? '#fff' : c.tx, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.text}
                <div style={{ fontSize: 10, color: msg.isUser ? 'rgba(255,255,255,0.6)' : c.muted, marginTop: 4, textAlign: msg.isUser ? 'right' : 'left' }}>{msg.time}</div>
              </div>
            </div>))}
          {sending && <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '2px 0' }}><TypingDots c={c} /></div>}
          <div ref={chatEndRef} />
        </div>
        <div style={{ padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', borderTop: '1px solid ' + c.border, background: c.sf, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={'Message ' + agentName.split(' ')[0] + '...'} rows={1}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 20, border: '1px solid ' + c.inputBorder, background: c.input, color: c.tx, fontSize: 15, fontFamily: 'inherit', resize: 'none', maxHeight: 120, lineHeight: 1.4 }} />
          <button onClick={sendMessage} disabled={!input.trim() || sending}
            style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: (!input.trim() || sending) ? c.border : c.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (!input.trim() || sending) ? 'default' : 'pointer', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </>) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: c.card, border: '1px solid ' + c.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, marginBottom: 16 }}>
            {tab === 'call' ? '\uD83D\uDCDE' : '\uD83C\uDF10'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: c.tx, marginBottom: 6 }}>{tab === 'call' ? 'Voice Calls' : 'Video Conference'}</div>
          <div style={{ fontSize: 13, color: c.sub, lineHeight: 1.5, maxWidth: 260 }}>
            {tab === 'call' ? 'Call your Bloomie directly from your phone. Coming soon.' : 'Face-to-face meetings with your Bloomie and team. Coming soon.'}
          </div>
          <div style={{ marginTop: 20, padding: '8px 20px', borderRadius: 20, background: c.card, border: '1px solid ' + c.border, fontSize: 12, fontWeight: 600, color: c.accent }}>Coming Soon</div>
        </div>
      )}
    </div>
  );
}
