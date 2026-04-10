import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const BRAND    = '#F4A261';
const GRADIENT = 'linear-gradient(135deg, #F4A261, #E76F8B)';
const GREEN    = '#22C55E';

const THEMES = {
  light: {
    bg:         '#FFFFFF',
    sf:         '#F5F5F5',
    presenceBg: '#F5F5F5',
    inputBg:    '#FFFFFF',
    agentBubble:'#FFFFFF',
    toolBubble: '#F5F5F5',
    border:     '#E5E7EB',
    textPri:    '#111827',
    textSec:    '#6B7280',
    textMut:    '#9CA3AF',
    userBubble: BRAND,
    userText:   '#FFFFFF',
    badgeBg:    '#FFFFFF',
  },
  dark: {
    bg:         '#1a1a1a',
    sf:         '#212121',
    presenceBg: '#111111',
    inputBg:    '#212121',
    agentBubble:'#262626',
    toolBubble: '#1e1e1e',
    border:     '#353535',
    textPri:    '#F0F0F0',
    textSec:    '#9A9A9A',
    textMut:    '#555555',
    userBubble: BRAND,
    userText:   '#FFFFFF',
    badgeBg:    '#262626',
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

const ChevronRightIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
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

const CloseIcon = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// File type icon — inline SVG, inherits `color` from parent
function FileTypeIcon({ type, size = 16 }) {
  const s = { strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (type) {
    case 'html':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...s}>
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      );
    case 'code':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...s}>
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      );
    case 'image':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...s}>
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      );
    default: // pdf, document, text, markdown, etc.
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      );
  }
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ src, name, size = 36, radius = 10 }) {
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: GRADIENT,
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

// ─── Presence Area ─────────────────────────────────────────────────────────────
// States: 'active' | 'idle' | 'speaking'
// All layers are always mounted; CSS opacity transitions handle state switches smoothly.
function PresenceArea({ agent, presenceState, c, idleImages, kenBurnsIdx, onSpeakingStart, onSpeakingEnd }) {
  const stateLabel = { active: 'Active', idle: 'Idle', speaking: 'Speaking…' };
  const stateColor = { active: GREEN, idle: c.textMut, speaking: BRAND };
  const color = stateColor[presenceState] ?? c.textMut;

  const showIdle   = presenceState === 'idle' || presenceState === 'speaking';
  const hasImages  = !!(idleImages[0] || idleImages[1]);

  return (
    <div style={{
      width: '100%', aspectRatio: '16/9',
      background: c.presenceBg,
      position: 'relative', flexShrink: 0, overflow: 'hidden',
    }}>
      {/* Ken Burns image layers — idle + speaking */}
      {[0, 1].map(i => {
        const url = idleImages[i];
        if (!url) return null;
        return (
          <div key={i} style={{
            position: 'absolute', inset: 0, overflow: 'hidden',
            opacity: (showIdle && kenBurnsIdx === i) ? 1 : 0,
            transition: 'opacity 1.5s ease-in-out',
          }}>
            <img
              src={url}
              alt=""
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                animation: `kenBurns${i} 16s ease-in-out infinite alternate`,
                willChange: 'transform',
              }}
            />
          </div>
        );
      })}

      {/* Gradient overlay for idle/speaking + images */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.65) 100%)',
        opacity: (showIdle && hasImages) ? 1 : 0,
        transition: 'opacity 0.6s ease',
      }} />

      {/* Active state — avatar + animated green dot */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: presenceState === 'active' ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: presenceState === 'active' ? 'auto' : 'none',
      }}>
        <div style={{ position: 'relative' }}>
          <Avatar src={agent?.avatar_url} name={agent?.name || 'B'} size={64} radius={20} />
          <span style={{
            position: 'absolute', bottom: 1, right: 1,
            width: 14, height: 14, borderRadius: '50%',
            background: GREEN, border: `2.5px solid ${c.presenceBg}`,
            display: 'block',
            animation: 'activePulse 2s ease-in-out infinite',
          }} />
        </div>
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
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, display: 'block' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: GREEN }}>Active</span>
        </div>
      </div>

      {/* Idle/speaking fallback — no images yet */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        opacity: (showIdle && !hasImages) ? 1 : 0,
        transition: 'opacity 0.5s ease',
        pointerEvents: (showIdle && !hasImages) ? 'auto' : 'none',
      }}>
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
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: color, display: 'block',
            animation: 'activePulse 3s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color }}>
            {stateLabel[presenceState] ?? 'Idle'}
          </span>
        </div>
      </div>

      {/* Idle/speaking name badge — bottom-left, visible when images are present */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: 6,
        opacity: (showIdle && hasImages) ? 1 : 0,
        transition: 'opacity 0.6s ease',
      }}>
        <Avatar src={agent?.avatar_url} name={agent?.name || 'B'} size={28} radius={8} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
            {agent?.name || 'Bloomie'}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1.2 }}>
            {agent?.job_title || agent?.role || ''}
          </div>
        </div>
        <div style={{
          marginLeft: 4, display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 12,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'block' }} />
          <span style={{ fontSize: 10, fontWeight: 600, color: '#FFFFFF' }}>
            {stateLabel[presenceState] ?? 'Idle'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Artifact delivery card ───────────────────────────────────────────────────
function ArtifactCard({ artifact, c, onView }) {
  return (
    <div style={{
      maxWidth: '78%',
      border: `1px solid ${c.border}`,
      borderRadius: 16,
      background: c.agentBubble,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: `${BRAND}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: BRAND,
        }}>
          <FileTypeIcon type={artifact.fileType} size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: c.textPri,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {artifact.name}
          </div>
          {artifact.description && (
            <div style={{
              fontSize: 11, color: c.textSec, marginTop: 2, lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {artifact.description}
            </div>
          )}
          <div style={{ fontSize: 10, color: c.textMut, marginTop: 4 }}>
            {new Date(artifact.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${c.border}`, display: 'flex' }}>
        <button
          onClick={onView}
          style={{
            flex: 1, padding: '9px 0', border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: BRAND,
            fontFamily: 'inherit', borderRight: `1px solid ${c.border}`,
          }}
        >
          View
        </button>
        <a
          href="/app#artifacts"
          style={{
            flex: 1, padding: '9px 0', border: 'none', background: 'none',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, color: c.textSec,
            fontFamily: 'inherit', textDecoration: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          Open in App
        </a>
      </div>
    </div>
  );
}

// ─── Artifact preview modal ───────────────────────────────────────────────────
function ArtifactPreview({ artifact, c, onClose }) {
  if (!artifact) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: c.sf, borderBottom: `1px solid ${c.border}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 32, height: 32, border: 'none', background: c.inputBg,
            borderRadius: 8, cursor: 'pointer', color: c.textPri,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CloseIcon color={c.textPri} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: c.textPri,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {artifact.name}
          </div>
          <div style={{ fontSize: 10, color: c.textMut, textTransform: 'uppercase' }}>
            {artifact.fileType}
          </div>
        </div>
        <a
          href={artifact.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12, fontWeight: 600, color: BRAND,
            textDecoration: 'none', padding: '6px 12px',
            background: `${BRAND}22`, borderRadius: 8, flexShrink: 0,
          }}
        >
          Download
        </a>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', background: c.bg }}>
        {artifact.fileType === 'html' ? (
          <iframe
            src={artifact.previewUrl || artifact.downloadUrl}
            sandbox="allow-scripts allow-same-origin"
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={artifact.name}
          />
        ) : artifact.fileType === 'image' ? (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}>
            <img
              src={artifact.previewUrl || artifact.downloadUrl}
              alt={artifact.name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }}
            />
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', overflow: 'auto', padding: 16 }}>
            <pre style={{
              fontSize: 12, lineHeight: 1.6, color: c.textPri,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontFamily: artifact.fileType === 'code' ? 'monospace' : 'inherit',
            }}>
              {artifact.content || `No preview available.\n\nDownload the file to view its contents.`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Assets Tab ───────────────────────────────────────────────────────────────
function AssetsTab({ c, agentName, artifacts, loading, onOpenArtifact }) {
  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg }}>
        <div style={{ fontSize: 13, color: c.textMut }}>Loading assets…</div>
      </div>
    );
  }

  if (!artifacts.length) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 10, padding: '0 32px', background: c.bg,
      }}>
        <FolderIcon color={c.textMut} />
        <div style={{ fontSize: 14, fontWeight: 600, color: c.textSec }}>No assets yet</div>
        <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5, color: c.textMut }}>
          Files and deliverables from {agentName.split(' ')[0]} will appear here.
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, overflowY: 'auto', background: c.bg,
      padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {artifacts.map(artifact => (
        <button
          key={artifact.id}
          onClick={() => onOpenArtifact(artifact)}
          style={{
            width: '100%', border: `1px solid ${c.border}`, borderRadius: 12,
            background: c.agentBubble, padding: '10px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer', textAlign: 'left', transition: 'opacity 0.15s',
          }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: `${BRAND}22`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: BRAND,
          }}>
            <FileTypeIcon type={artifact.fileType} size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: c.textPri,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {artifact.name}
            </div>
            {artifact.description && (
              <div style={{
                fontSize: 11, color: c.textSec, marginTop: 1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {artifact.description}
              </div>
            )}
            <div style={{ fontSize: 10, color: c.textMut, marginTop: 2 }}>
              {new Date(artifact.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
          <ChevronRightIcon color={c.textMut} />
        </button>
      ))}
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
        background: GRADIENT,
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
          background: GRADIENT,
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

  // ── Core state ────────────────────────────────────────────────────────────
  const [user,          setUser]          = useState(authUser || null);
  const [allAgents,     setAllAgents]     = useState([]);
  const [agent,         setAgent]         = useState(null);
  const [orgId,         setOrgId]         = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [sending,       setSending]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [initError,     setInitError]     = useState(null);
  const [tab,           setTab]           = useState('chat');
  const [presenceState, setPresenceState] = useState('idle');

  // ── Phase 2: presence ─────────────────────────────────────────────────────
  const [idleImages,    setIdleImages]    = useState([null, null]);
  const [kenBurnsIdx,   setKenBurnsIdx]   = useState(0);

  // ── Phase 3: assets ───────────────────────────────────────────────────────
  const [artifacts,        setArtifacts]        = useState([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [previewArtifact,  setPreviewArtifact]  = useState(null);

  // ── Conference tab ────────────────────────────────────────────────────────
  const [confMessages,  setConfMessages]  = useState([]);
  const [confInput,     setConfInput]     = useState('');
  const [confSending,   setConfSending]   = useState(false);
  const confEndRef    = useRef(null);
  const confSessionRef = useRef('conf-mobile-' + Date.now().toString(36));

  // ── File attachment ───────────────────────────────────────────────────────
  const [pendingFiles,  setPendingFiles]  = useState([]);
  const fileInputRef = useRef(null);

  // ── Scroll to bottom ─────────────────────────────────────────────────────
  const [showScrollDown, setShowScrollDown] = useState(false);
  const chatScrollRef = useRef(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const chatEndRef       = useRef(null);
  const sessionRef       = useRef(null);
  const inputRef         = useRef(null);
  const lastActivityRef  = useRef(Date.now());   // tracks last user input time
  const sendingRef       = useRef(false);         // mirrors `sending` for setInterval closures
  const generatingRef    = useRef(false);         // prevents duplicate image generation calls
  const knownArtifactIds = useRef(new Set());     // tracks artifacts already shown as cards
  const allMessagesCache = useRef({});            // per-agent message cache

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem('bloom-mobile-theme', next ? 'dark' : 'light');
  };

  // ── Speaking hooks (Phase 2 — wired; Phase 3 speech player would use these) ─
  const onSpeakingStart = useCallback(() => setPresenceState('speaking'), []);
  const onSpeakingEnd   = useCallback(() => setPresenceState('active'),   []);

  // ── Mark user activity ────────────────────────────────────────────────────
  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setPresenceState(s => s === 'speaking' ? s : 'active');
  }, []);

  // ── Switch agent ──────────────────────────────────────────────────────────
  const switchAgent = useCallback((newAgent) => {
    if (!newAgent || newAgent.id === agent?.id) return;
    setAgent(newAgent);
    setPresenceState('active');
    lastActivityRef.current = Date.now();
    sessionRef.current = 'mobile-' + newAgent.id.slice(0, 8) + '-' + Date.now().toString(36);
    setMessages(allMessagesCache.current[newAgent.id] || []);
    setArtifacts([]);
    knownArtifactIds.current = new Set();
    generatingRef.current = false;
    setIdleImages([null, null]);
    setPendingFiles([]);
    setInput('');
    if (tab === 'conference') setTab('chat');
  }, [agent?.id, tab]);

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
          lastActivityRef.current = Date.now();
          sessionRef.current = 'mobile-' + active.id.slice(0, 8) + '-' + Date.now().toString(36);

          // Cache all agents' messages for quick switching
          if (data.messages) {
            Object.entries(data.messages).forEach(([agId, msgs]) => {
              allMessagesCache.current[agId] = (msgs || []).map(m => ({
                id:     m.id,
                isUser: m.role === 'user',
                text:   m.content,
                type:   'text',
                time:   new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
              }));
            });
          }

          const agentMsgs = data.messages?.[active.id] || [];
          setMessages(agentMsgs.map(m => ({
            id:     m.id,
            isUser: m.role === 'user',
            text:   m.content,
            type:   'text',
            time:   new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          })));

          // Pre-populate known artifact IDs so old artifacts don't appear as delivery cards
          try {
            const ar = await fetch(`${API}/api/files/artifacts?agentId=${active.id}&limit=200`, { headers: h });
            if (ar.ok) {
              const ad = await ar.json();
              (ad.artifacts || []).forEach(a => knownArtifactIds.current.add(a.id));
            }
          } catch { /* silent */ }
        }
      } catch (e) {
        console.error('[BloomiePWA] Init error:', e);
        setInitError(e.message);
      }
      setLoading(false);
    })();
  }, [user]);

  // ── Fetch idle images when agent is set ───────────────────────────────────
  useEffect(() => {
    if (!agent?.id) return;
    setIdleImages([null, null]);
    generatingRef.current = false;
    (async () => {
      try {
        const h = await authHeaders();
        const r = await fetch(`${API}/api/mobile/agents/${agent.id}/idle-images`, { headers: h });
        if (!r.ok) return;
        const d = await r.json();
        if (d.url1 || d.url2) setIdleImages([d.url1, d.url2]);
      } catch { /* silent — fallback to avatar */ }
    })();
  }, [agent?.id]);

  // ── Trigger image generation on first idle (if no images cached) ──────────
  useEffect(() => {
    if (presenceState !== 'idle') return;
    if (idleImages[0] || idleImages[1]) return;
    if (generatingRef.current || !agent?.id) return;

    generatingRef.current = true;
    (async () => {
      try {
        const h = await authHeaders();
        const r = await fetch(`${API}/api/mobile/agents/${agent.id}/generate-idle-images`, {
          method: 'POST', headers: h,
        });
        if (!r.ok) return;
        const d = await r.json();
        if (d.url1 || d.url2) setIdleImages([d.url1, d.url2]);
      } catch { /* silent */ } finally {
        generatingRef.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceState, idleImages[0], idleImages[1], agent?.id]);

  // ── Ken Burns cycling ─────────────────────────────────────────────────────
  useEffect(() => {
    const shouldAnimate = presenceState === 'idle' || presenceState === 'speaking';
    if (!shouldAnimate || (!idleImages[0] && !idleImages[1])) return;

    setKenBurnsIdx(0);
    const interval = setInterval(() => setKenBurnsIdx(i => 1 - i), 8000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceState, idleImages[0], idleImages[1]]);

  // ── Idle detection (poll every 5s; skip while agent is responding) ────────
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    if (!agent) return;
    const IDLE_TIMEOUT = 30_000;
    const check = setInterval(() => {
      if (sendingRef.current) return;
      if (Date.now() - lastActivityRef.current > IDLE_TIMEOUT) {
        setPresenceState(s => s === 'speaking' ? s : 'idle');
      }
    }, 5000);
    return () => clearInterval(check);
  }, [agent]);

  // ── Fetch artifacts when assets tab is opened ─────────────────────────────
  const fetchArtifacts = useCallback(async () => {
    if (!agent?.id) return;
    setArtifactsLoading(true);
    try {
      const h = await authHeaders();
      const r = await fetch(`${API}/api/files/artifacts?agentId=${agent.id}&limit=100`, { headers: h });
      if (!r.ok) return;
      const d = await r.json();
      const list = d.artifacts || [];
      setArtifacts(list);
      list.forEach(a => knownArtifactIds.current.add(a.id));
    } catch { /* silent */ }
    setArtifactsLoading(false);
  }, [agent?.id]);

  useEffect(() => {
    if (tab === 'assets' && agent?.id) fetchArtifacts();
  }, [tab, agent?.id]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showScrollDown) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, sending]);

  useEffect(() => {
    confEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [confMessages, confSending]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingFiles.length) || sending) return;
    const filesToSend = [...pendingFiles];
    setInput('');
    setPendingFiles([]);
    setSending(true);
    setPresenceState('speaking');
    setMessages(p => [...p, { id: 'u-' + Date.now(), isUser: true, text: text || '(attachment)', type: 'text', time: ts(), files: filesToSend }]);

    try {
      const h    = await authHeaders();
      const body = { message: text || '(see attached files)', sessionId: sessionRef.current, agentId: agent?.id };
      if (orgId) body.organizationId = orgId;
      if (filesToSend.length) body.files = filesToSend.map(f => ({ name: f.name, type: f.type, dataUrl: f.dataUrl }));

      const r   = await fetch(API + '/api/chat/message', { method: 'POST', headers: h, body: JSON.stringify(body) });
      const d   = await r.json();
      const raw = d.response || d.message || 'Done.';

      // Extract hidden file delivery tag before cleaning
      const fileTagMatch = raw.match(/<!--\s*file:([^\s>]+)\s*-->/);
      const clean = raw
        .replace(/<!--\s*file:[^\s>]+\s*-->/g, '')
        .replace(/\s*\[Session context[\s\S]*$/, '')
        .trim();

      setMessages(p => [...p, { id: 'a-' + Date.now(), isUser: false, text: clean, type: 'text', time: ts() }]);

      // Delivery card: fetch new artifact if file tag detected
      if (fileTagMatch) {
        const filename = fileTagMatch[1];
        try {
          const h2 = await authHeaders();
          const ar = await fetch(`${API}/api/files/artifacts?agentId=${agent?.id}&limit=10`, { headers: h2 });
          if (ar.ok) {
            const ad = await ar.json();
            const newOnes = (ad.artifacts || []).filter(a => !knownArtifactIds.current.has(a.id));
            newOnes.forEach(a => knownArtifactIds.current.add(a.id));
            const artifact = newOnes.find(a => a.name === filename) || newOnes[0];
            if (artifact) {
              setArtifacts(prev => {
                const ids = new Set(prev.map(x => x.id));
                return ids.has(artifact.id) ? prev : [artifact, ...prev];
              });
              setMessages(p => [...p, {
                id:       'artifact-' + Date.now(),
                isUser:   false,
                type:     'artifact',
                artifact,
                time:     ts(),
              }]);
            }
          }
        } catch { /* silent */ }
      }
    } catch {
      setMessages(p => [...p, { id: 'e-' + Date.now(), isUser: false, text: 'Something went wrong. Try again.', type: 'text', time: ts() }]);
    }

    setSending(false);
    setPresenceState('active');
    lastActivityRef.current = Date.now();
    inputRef.current?.focus();
  }, [input, sending, agent, orgId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Chat scroll handler ───────────────────────────────────────────────────
  const handleChatScroll = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distFromBottom > 120);
  }, []);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollDown(false);
  }, []);

  // ── File attachment ───────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const processed = await Promise.all(files.map(async f => {
      if (f.type.startsWith('image/') || f.type.startsWith('video/') || f.size < 5 * 1024 * 1024) {
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = ev => resolve({ name: f.name, type: f.type, size: f.size, dataUrl: ev.target.result });
          reader.readAsDataURL(f);
        });
      }
      return { name: f.name, type: f.type, size: f.size, dataUrl: null };
    }));
    setPendingFiles(prev => [...prev, ...processed]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const removePendingFile = useCallback((idx) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ── Conference send ───────────────────────────────────────────────────────
  const sendConfMessage = useCallback(async () => {
    const text = confInput.trim();
    if (!text || confSending || !allAgents.length) return;
    setConfInput('');
    setConfSending(true);
    const tstamp = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    setConfMessages(p => [...p, { id: 'cu-' + Date.now(), from: 'user', text, time: tstamp() }]);

    try {
      const h = await authHeaders();
      await fetch(`${API}/api/chat/conference/user-message`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ text, sessionId: confSessionRef.current + '-user' }),
      });
    } catch { /* silent */ }

    const detectMentions = (msg, excludeId) => {
      const lower = msg.toLowerCase();
      return allAgents.filter(a => {
        if (excludeId && a.id === excludeId) return false;
        const first = a.name.split(' ')[0].toLowerCase();
        return lower.includes(first) || lower.includes(a.name.toLowerCase());
      });
    };

    const sendToOne = async (a, thread) => {
      const ctx = `[You are ${a.name} in a group chat with the client and ${allAgents.filter(x => x.id !== a.id).map(x => x.name).join(', ')}. Thread so far:\n${thread}\n\nRespond naturally as ${a.name}. Keep it brief and collaborative. If the message has nothing to do with you, stay silent.]`;
      try {
        const h = await authHeaders();
        const r = await fetch(`${API}/api/chat/message`, {
          method: 'POST', headers: h,
          body: JSON.stringify({ message: ctx, sessionId: confSessionRef.current + '-' + a.id.slice(0, 8), agentId: a.id, skipUserSave: true }),
        });
        const d = await r.json();
        let rt = (d.response || d.message || '').replace(/\s*\[Session context[\s\S]*$/, '').replace(/\s*\[Tool:.*?\]\s*/g, '').trim();
        rt = rt.replace(/^\[You are[\s\S]*?silent\.\]\s*/i, '').trim();
        if (rt && !rt.match(/^(\*stays silent\*|\*silent\*|\.\.\.|\*no response\*)/i)) return rt;
      } catch { /* silent */ }
      return null;
    };

    const recent = [...confMessages.slice(-20), { from: 'user', text }];
    let running = recent.map(m => m.from === 'user' ? `Client: ${m.text}` : `${m.fromAgent || 'Agent'}: ${m.text}`).join('\n');

    const addressed = detectMentions(text, null);
    const responding = addressed.length > 0 ? addressed : allAgents;

    let lastResponders = [];
    for (const a of responding) {
      const rt = await sendToOne(a, running);
      if (rt) {
        const msg = { id: 'ca-' + a.id.slice(0, 8) + '-' + Date.now(), from: 'agent', fromAgent: a.name, agentId: a.id, avatar: a.avatar_url, text: rt, time: tstamp() };
        setConfMessages(p => [...p, msg]);
        running += `\n${a.name}: ${rt}`;
        lastResponders.push({ agent: a, text: rt });
      }
    }

    for (let round = 0; round < 3; round++) {
      if (!lastResponders.length) break;
      const nextMap = new Map();
      for (const { agent: resp, text: rText } of lastResponders) {
        for (const m of detectMentions(rText, resp.id)) { if (!nextMap.has(m.id)) nextMap.set(m.id, m); }
      }
      if (!nextMap.size) break;
      lastResponders = [];
      for (const [, a] of nextMap) {
        const rt = await sendToOne(a, running);
        if (rt) {
          const msg = { id: 'ca-' + a.id.slice(0, 8) + '-' + Date.now() + '-r' + round, from: 'agent', fromAgent: a.name, agentId: a.id, avatar: a.avatar_url, text: rt, time: tstamp() };
          setConfMessages(p => [...p, msg]);
          running += `\n${a.name}: ${rt}`;
          lastResponders.push({ agent: a, text: rt });
        }
      }
    }

    setConfSending(false);
  }, [confInput, confSending, allAgents, confMessages]);

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

        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30%            { transform: translateY(-4px); }
        }
        @keyframes activePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.8); }
        }
        @keyframes kenBurns0 {
          0%   { transform: scale(1.0) translate(0%,    0%);   }
          100% { transform: scale(1.18) translate(-4%, -3%);   }
        }
        @keyframes kenBurns1 {
          0%   { transform: scale(1.18) translate(4%,  3%);    }
          100% { transform: scale(1.0) translate(0%,   0%);    }
        }

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
        <button
          onClick={() => window.history.back()}
          aria-label="Back"
          style={{ width: 40, height: 40, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <ChevronLeftIcon color={c.textPri} />
        </button>

        {/* Agent picker dropdown — centered */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
          {allAgents.length > 1 ? (
            <select
              value={agent?.id || ''}
              onChange={e => switchAgent(allAgents.find(a => a.id === e.target.value))}
              style={{
                fontSize: 14, fontWeight: 700, color: c.textPri,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'center', appearance: 'none',
                WebkitAppearance: 'none', padding: '0 16px 0 0',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath fill='none' stroke='%23${c.textMut.slice(1)}' stroke-width='1.5' d='M1 1l4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center',
              }}
            >
              {allAgents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 15, fontWeight: 700, color: c.textPri, lineHeight: 1.2 }}>{agentName}</div>
          )}
          <div style={{ fontSize: 10, color: c.textSec, lineHeight: 1.2, pointerEvents: 'none' }}>{agentRole}</div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOnline ? GREEN : c.textMut, display: 'block' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: isOnline ? GREEN : c.textMut }}>
              {isOnline ? 'Active' : 'Idle'}
            </span>
          </div>

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
        idleImages={idleImages}
        kenBurnsIdx={kenBurnsIdx}
        onSpeakingStart={onSpeakingStart}
        onSpeakingEnd={onSpeakingEnd}
      />

      {/* ═══ TAB TOGGLE ══════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', background: c.sf, borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
        {[
          { key: 'chat',       label: '💬 Chat'       },
          { key: 'assets',     label: '📁 Assets'     },
          { key: 'conference', label: '👥 Conference'  },
        ].map(({ key, label }) => {
          const active = tab === key;
          return (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, height: 40, border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              color: active ? BRAND : c.textMut,
              borderBottom: `2px solid ${active ? BRAND : 'transparent'}`,
              transition: 'color 0.2s, border-color 0.2s',
            }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ═══ TAB CONTENT ═════════════════════════════════════════════════════ */}
      {tab === 'assets' ? (
        <AssetsTab
          c={c}
          agentName={agentName}
          artifacts={artifacts}
          loading={artifactsLoading}
          onOpenArtifact={setPreviewArtifact}
        />
      ) : tab === 'conference' ? (
        <>
          {/* Conference thread */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '14px 12px 8px',
            display: 'flex', flexDirection: 'column', gap: 6,
            background: c.bg,
          }}>
            {confMessages.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: 40, padding: '0 24px' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: c.textPri, marginBottom: 4 }}>Team Conference</div>
                <div style={{ fontSize: 13, color: c.textSec, lineHeight: 1.5 }}>
                  Chat with all your Bloomie team members at once. They'll collaborate and respond together.
                </div>
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                  {allAgents.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: c.agentBubble, border: `1px solid ${c.border}`, fontSize: 12, color: c.textSec }}>
                      <Avatar src={a.avatar_url} name={a.name} size={18} radius={5} />
                      {a.name.split(' ')[0]}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              confMessages.map(msg => (
                <div key={msg.id} style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start', padding: '2px 0' }}>
                  {msg.from === 'agent' && (
                    <div style={{ marginRight: 6, flexShrink: 0, alignSelf: 'flex-end' }}>
                      <Avatar src={msg.avatar} name={msg.fromAgent || 'B'} size={26} radius={7} />
                    </div>
                  )}
                  <div style={{ maxWidth: '78%' }}>
                    {msg.from === 'agent' && (
                      <div style={{ fontSize: 10, fontWeight: 600, color: BRAND, marginBottom: 2, paddingLeft: 2 }}>
                        {msg.fromAgent}
                      </div>
                    )}
                    <div style={{
                      padding: '10px 14px',
                      borderRadius: msg.from === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: msg.from === 'user' ? c.userBubble : c.agentBubble,
                      border: msg.from === 'user' ? 'none' : `1px solid ${c.border}`,
                      color: msg.from === 'user' ? c.userText : c.textPri,
                      fontSize: 14, lineHeight: 1.5,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {msg.text}
                      <div style={{ fontSize: 10, color: msg.from === 'user' ? 'rgba(255,255,255,0.6)' : c.textMut, marginTop: 4, textAlign: msg.from === 'user' ? 'right' : 'left' }}>
                        {msg.time}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {confSending && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, padding: '2px 0' }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {allAgents.length}
                </div>
                <TypingDots c={c} />
              </div>
            )}
            <div ref={confEndRef} />
          </div>

          {/* Conference input bar */}
          <div style={{ borderTop: `1px solid ${c.border}`, background: c.sf, flexShrink: 0 }}>
            <div style={{ padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                border: `1.5px solid ${c.border}`, borderRadius: 20,
                background: c.inputBg, padding: '8px 8px 8px 14px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              }}>
                <textarea
                  value={confInput}
                  onChange={e => { setConfInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px'; }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendConfMessage(); } }}
                  placeholder="Message the team…"
                  rows={1}
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    color: c.textPri, fontSize: 15, fontFamily: 'inherit',
                    resize: 'none', lineHeight: 1.4, maxHeight: 96,
                    padding: '2px 0', outline: 'none',
                  }}
                />
                <button
                  onClick={sendConfMessage}
                  disabled={!confInput.trim() || confSending}
                  aria-label="Send to team"
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                    background: (!confInput.trim() || confSending) ? 'transparent' : GRADIENT,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: (!confInput.trim() || confSending) ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  <SendIcon />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Chat thread */}
          <div
            ref={chatScrollRef}
            onScroll={handleChatScroll}
            style={{
              flex: 1, overflowY: 'auto', padding: '14px 12px 8px',
              display: 'flex', flexDirection: 'column', gap: 6,
              background: c.bg, position: 'relative',
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
                // Artifact delivery card
                if (msg.type === 'artifact') {
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-start', padding: '4px 0' }}>
                      <div style={{ marginRight: 6, flexShrink: 0, alignSelf: 'flex-end' }}>
                        <Avatar src={agent?.avatar_url} name={agentName} size={26} radius={7} />
                      </div>
                      <ArtifactCard
                        artifact={msg.artifact}
                        c={c}
                        onView={() => setPreviewArtifact(msg.artifact)}
                      />
                    </div>
                  );
                }

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
                        {/* Inline file previews */}
                        {msg.files?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: msg.text && msg.text !== '(attachment)' ? 8 : 4 }}>
                            {msg.files.map((f, fi) => (
                              f.type?.startsWith('image/') && f.dataUrl
                                ? <img key={fi} src={f.dataUrl} alt={f.name} style={{ maxWidth: 180, maxHeight: 140, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.15)' }} />
                                : <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.15)' }}>
                                    <span style={{ fontSize: 14 }}>{f.type?.startsWith('video/') ? '🎬' : '📎'}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                  </div>
                            ))}
                          </div>
                        )}
                        {msg.text !== '(attachment)' && msg.text}
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

          {/* Scroll-to-bottom button */}
          {showScrollDown && (
            <button
              onClick={scrollToBottom}
              aria-label="Scroll to latest"
              style={{
                position: 'absolute', bottom: 76, right: 16, zIndex: 10,
                width: 36, height: 36, borderRadius: 18,
                background: c.sf, border: `1px solid ${c.border}`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textSec} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}

          {/* ═══ STICKY INPUT BAR ════════════════════════════════════════════ */}
          <div style={{ borderTop: `1px solid ${c.border}`, background: c.sf, flexShrink: 0 }}>
            {/* File attachment previews */}
            {pendingFiles.length > 0 && (
              <div style={{ padding: '6px 12px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={{ position: 'relative', display: 'inline-flex' }}>
                    {f.type?.startsWith('image/') && f.dataUrl ? (
                      <img src={f.dataUrl} alt={f.name} style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', border: `1px solid ${c.border}` }} />
                    ) : (
                      <div style={{ width: 52, height: 52, borderRadius: 8, background: c.inputBg, border: `1px solid ${c.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                        <span style={{ fontSize: 18 }}>{f.type?.startsWith('video/') ? '🎬' : '📎'}</span>
                        <span style={{ fontSize: 8, color: c.textMut, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', paddingTop: 2 }}>{f.name}</span>
                      </div>
                    )}
                    <button onClick={() => removePendingFile(i)} style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, background: '#333', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '8px 12px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-end', gap: 6,
                border: `1.5px solid ${c.border}`, borderRadius: 20,
                background: c.inputBg, padding: '8px 8px 8px 8px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                transition: 'border-color 0.2s',
              }}>
                {/* File attachment button */}
                <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.csv,.txt,.docx,.xlsx,.json,.md" style={{ display: 'none' }} onChange={handleFileSelect} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach files"
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                    background: 'transparent', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c.textSec} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                    markActivity();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${agentName.split(' ')[0]}…`}
                  rows={1}
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    color: c.textPri, fontSize: 15, fontFamily: 'inherit',
                    resize: 'none', lineHeight: 1.4, maxHeight: 96,
                    padding: '6px 4px', outline: 'none',
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() && !pendingFiles.length || sending}
                  aria-label="Send"
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: 'none', flexShrink: 0,
                    background: (input.trim() || pendingFiles.length) && !sending ? GRADIENT : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: (input.trim() || pendingFiles.length) && !sending ? 'pointer' : 'default',
                    transition: 'background 0.15s',
                    marginBottom: 0,
                    color: (input.trim() || pendingFiles.length) && !sending ? '#fff' : c.textMut,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ ARTIFACT PREVIEW MODAL ══════════════════════════════════════════ */}
      {previewArtifact && (
        <ArtifactPreview
          artifact={previewArtifact}
          c={c}
          onClose={() => setPreviewArtifact(null)}
        />
      )}
    </div>
  );
}
