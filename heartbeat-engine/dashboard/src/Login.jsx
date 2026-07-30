import { useState } from 'react';
import { supabase } from './supabase.js';

// Preset Bloomie roles — each has a title and a FOCUS description that drives behavior
const BLOOMIE_ROLES = [
  {
    title: 'Marketing Manager',
    focus: 'Your primary focus is marketing strategy, content creation, campaign management, social media, email marketing, brand voice development, and audience engagement. You prioritize lead generation, brand awareness, and content calendars. When checking in each cycle, you look for marketing opportunities first — new content to create, campaigns to optimize, social posts to schedule, and engagement metrics to analyze.'
  },
  {
    title: 'Client Coordinator',
    focus: 'Your primary focus is client relationships, onboarding, follow-ups, scheduling, and communication management. You prioritize client satisfaction, timely responses, and relationship nurturing. When checking in each cycle, you look for client needs first — unanswered inquiries, overdue follow-ups, upcoming meetings to prepare for, and client feedback to address.'
  },
  {
    title: 'Executive Assistant',
    focus: 'Your primary focus is calendar management, email triage, meeting preparation, document organization, travel coordination, and executive communication. You prioritize keeping your executive organized, on-time, and prepared. When checking in each cycle, you look for scheduling conflicts, unanswered priority emails, upcoming meetings that need agendas, and tasks that need delegation.'
  },
  {
    title: 'Sales Representative',
    focus: 'Your primary focus is lead outreach, pipeline management, proposal creation, follow-up sequences, and closing deals. You prioritize revenue-generating activities and relationship building with prospects. When checking in each cycle, you look for hot leads to follow up with, proposals to send, deals to close, and new prospects to engage.'
  },
  {
    title: 'Content Creator',
    focus: 'Your primary focus is writing blog posts, articles, social media content, email newsletters, ad copy, video scripts, and creative assets. You prioritize engaging storytelling, brand-consistent voice, and content that drives action. When checking in each cycle, you look for content deadlines, topics to research, drafts to refine, and publishing schedules to maintain.'
  },
  {
    title: 'Operations Manager',
    focus: 'Your primary focus is process optimization, workflow management, team coordination, reporting, and ensuring things run smoothly day-to-day. You prioritize efficiency, documentation, SOPs, and removing bottlenecks. When checking in each cycle, you look for process breakdowns, overdue tasks, reporting deadlines, and operational improvements to implement.'
  },
  {
    title: 'Customer Support Specialist',
    focus: 'Your primary focus is resolving customer issues, answering questions, managing support tickets, creating help documentation, and ensuring customer satisfaction. You prioritize fast response times, empathetic communication, and first-contact resolution. When checking in each cycle, you look for open tickets, recurring issues to document solutions for, and customer feedback to act on.'
  },
  {
    title: 'Project Manager',
    focus: 'Your primary focus is project planning, milestone tracking, team coordination, status reporting, and deadline management. You prioritize keeping projects on track, removing blockers, and clear communication with stakeholders. When checking in each cycle, you look for overdue milestones, blocked tasks, status updates to send, and upcoming deadlines to prepare for.'
  },
  {
    title: 'Social Media Manager',
    focus: 'Your primary focus is social media strategy, content scheduling, community engagement, analytics tracking, and trend monitoring across all platforms. You prioritize consistent posting, audience growth, and engagement rates. When checking in each cycle, you look for posts to schedule, comments to respond to, trending topics to leverage, and analytics to report on.'
  },
  {
    title: 'Custom role',
    focus: ''
  }
];

export default function Login({ product = 'bloomie', initialBookCheckout = false }) {
  const isBookCreator = product === 'book_creator';
  const isBloomStudio = product === 'bloom_studio';
  const isStandaloneProduct = isBookCreator || isBloomStudio;
  const isPurchasedProductAccess = isStandaloneProduct && new URLSearchParams(window.location.search).get('purchase') === 'success';
  const [mode, setMode] = useState(isPurchasedProductAccess ? 'signup' : 'login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [bloomieName, setBloomieName] = useState('');
  const [selectedRoleIdx, setSelectedRoleIdx] = useState(-1); // -1 = nothing selected
  const [customRoleTitle, setCustomRoleTitle] = useState('');
  const [customFocus, setCustomFocus] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [bookCheckoutOpen, setBookCheckoutOpen] = useState(initialBookCheckout);

  const isCustomRole = selectedRoleIdx === BLOOMIE_ROLES.length - 1;
  const selectedRole = selectedRoleIdx >= 0 ? BLOOMIE_ROLES[selectedRoleIdx] : null;
  const effectiveTitle = isCustomRole ? customRoleTitle.trim() : (selectedRole?.title || '');
  const effectiveFocus = isCustomRole ? customFocus.trim() : (selectedRole?.focus || '');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: password
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError('Enter your email address above first'); return; }
    setLoading(true);
    setError('');
    setSuccess('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin + '/reset-password'
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Password reset email sent — check your inbox.');
      setForgotMode(false);
    }
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || (isStandaloneProduct ? !fullName.trim() : (!orgName.trim() || !bloomieName.trim() || !effectiveTitle))) return;
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/agent/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          fullName: fullName.trim(),
          organizationName: isBookCreator ? `${fullName.trim()}'s Book Workspace` : isBloomStudio ? `${fullName.trim()}'s Bloom Studio` : orgName.trim(),
          industry: isBookCreator ? 'Publishing' : isBloomStudio ? 'Creative Production' : (industry.trim() || undefined),
          bloomieName: isBookCreator ? 'BookMint' : isBloomStudio ? 'Studio Guide' : bloomieName.trim(),
          bloomieRole: isBookCreator ? 'Book Creation Specialist' : isBloomStudio ? 'Video Production Specialist' : effectiveTitle,
          bloomieJobDescription: isBookCreator
            ? 'Help the user plan, write, revise, preview, format, and export complete books.'
            : isBloomStudio
              ? 'Help the user create images, characters, shorts, lip-sync videos, and motion projects in Bloom Studio.'
            : (effectiveFocus || undefined)
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Signup failed');
        setLoading(false);
        return;
      }
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      setLoading(false);
      if (loginError) {
        setSuccess('Account created! Please sign in.');
        setMode('login');
      }
    } catch (e) {
      setLoading(false);
      setError('Signup failed: ' + e.message);
    }
  };

  const accent = '#E76F8B';
  const text = '#f5f5f5';
  const sub = '#a1a1aa';
  const border = '#303036';

  const inputStyle = { padding:'12px 16px', borderRadius:10, border:`1.5px solid ${border}`, fontSize:15, color:text, outline:'none', background:'#222225', colorScheme:'dark', width:'100%', boxSizing:'border-box' };
  const selectStyle = { ...inputStyle, appearance:'none', backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23a1a1aa\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")', backgroundRepeat:'no-repeat', backgroundPosition:'right 14px center', paddingRight:36, cursor:'pointer' };

  const signupValid = isStandaloneProduct
    ? email.trim() && password.trim() && fullName.trim()
    : email.trim() && password.trim() && orgName.trim() && bloomieName.trim() && effectiveTitle;
  const isLogin = mode === 'login';

  return (
    <div
      data-testid="login-viewport"
      style={{
        height:'100dvh', minHeight:0, background:'radial-gradient(circle at 50% -10%,#2a2026 0,#141416 38%,#0d0d0f 75%)', display:'flex',
        alignItems:'center', justifyContent:'center',
        padding:isLogin ? 'clamp(12px, 2.5vh, 24px)' : 'clamp(12px, 2vh, 24px)',
        boxSizing:'border-box', overflow:'hidden',
        fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
      }}
    >
      <div
        data-testid="login-card"
        style={{
          background:'#18181b', borderRadius:16,
          padding:isLogin ? 'clamp(22px, 4.5vh, 42px) clamp(22px, 4vw, 40px)' : '40px',
          maxWidth:440, width:'100%', boxSizing:'border-box',
          boxShadow:'0 24px 70px rgba(0,0,0,.48)', border:`1px solid ${border}`,
          maxHeight:isLogin ? '100%' : 'calc(100dvh - 24px)',
          overflowY:isLogin ? 'visible' : 'auto',
          scrollbarGutter:isLogin ? undefined : 'stable'
        }}
      >

        <div style={{ textAlign:'center', marginBottom:isLogin ? 'clamp(18px, 3vh, 28px)' : 32 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:`linear-gradient(135deg, #E76F8B, #F4A261)`, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:isLogin ? 'clamp(10px, 2vh, 16px)' : 16 }}>
            <span style={{ color:'#fff', fontSize:22, fontWeight:800 }}>B</span>
          </div>
          <h1 style={{ margin:'0 0 4px', color:text, fontSize:24, fontWeight:800, letterSpacing:'-0.5px' }}>{isBookCreator ? 'BLOOMIE BOOK CREATOR' : isBloomStudio ? 'BLOOM STUDIO' : 'BLOOM'}</h1>
          <p style={{ margin:0, color:sub, fontSize:14 }}>
            {mode === 'login'
              ? `Sign in to your ${isBookCreator ? 'book workspace' : isBloomStudio ? 'creative studio' : 'dashboard'}`
              : isBookCreator
                ? 'Create your Book Creator account'
                : isBloomStudio
                  ? 'Create your Bloom Studio account'
                  : 'Create your account & get your Bloomie'}
          </p>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:isLogin ? 'clamp(9px, 1.7vh, 12px)' : 12 }}>
          {isPurchasedProductAccess && (
            <div style={{ padding:'11px 13px', borderRadius:10, background:'rgba(16,185,129,.12)', border:'1px solid rgba(52,211,153,.32)', color:'#6ee7b7', fontSize:13, lineHeight:1.5, fontWeight:650 }}>
              Purchase confirmed. Create your password with the same email address used at checkout.
            </div>
          )}
          {isBookCreator && isLogin && (
            <button
              type="button"
              onClick={() => setBookCheckoutOpen(true)}
              style={{
                padding:'13px 16px', borderRadius:10, border:'none',
                background:'linear-gradient(135deg,#F4A261,#E76F8B)',
                color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer',
                boxShadow:'0 8px 22px rgba(231,111,139,.24)'
              }}
            >
              Get Book Creator — $37 once
            </button>
          )}
          {mode === 'signup' && (
            <>
              {/* ── YOUR INFO ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ fontSize:13, fontWeight:600, color:text }}>Your name{isStandaloneProduct ? ' *' : ''}</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border} />
              </div>
              {!isStandaloneProduct && (
                <>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ fontSize:13, fontWeight:600, color:text }}>Organization name *</label>
                <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Acme Inc." style={inputStyle}
                  onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ fontSize:13, fontWeight:600, color:text }}>Industry</label>
                <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Marketing, Education, etc." style={inputStyle}
                  onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border} />
              </div>

              {/* ── YOUR BLOOMIE ── */}
              <div style={{ borderTop:`1px solid ${border}`, margin:'8px 0 4px', paddingTop:16 }}>
                <p style={{ margin:'0 0 4px', color:text, fontSize:14, fontWeight:700 }}>Meet your Bloomie</p>
                <p style={{ margin:'0 0 12px', color:sub, fontSize:12, lineHeight:'1.5' }}>
                  Your Bloomie is your AI employee. Give them a name and pick their job — this determines what they focus on every day. All Bloomies have the same capabilities, but their job description drives their priorities.
                </p>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ fontSize:13, fontWeight:600, color:text }}>Bloomie name *</label>
                <input type="text" value={bloomieName} onChange={e => setBloomieName(e.target.value)} placeholder="Sarah, Marcus, Alex..." style={inputStyle}
                  onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border} />
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ fontSize:13, fontWeight:600, color:text }}>Bloomie job title *</label>
                <select
                  value={selectedRoleIdx}
                  onChange={e => { setSelectedRoleIdx(Number(e.target.value)); setCustomRoleTitle(''); setCustomFocus(''); }}
                  style={selectStyle}
                  onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border}
                >
                  <option value={-1} disabled>Select a role...</option>
                  {BLOOMIE_ROLES.map((r, i) => (
                    <option key={i} value={i}>{r.title}</option>
                  ))}
                </select>
              </div>

              {/* Custom role fields */}
              {isCustomRole && (
                <>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <label style={{ fontSize:13, fontWeight:600, color:text }}>Custom job title *</label>
                    <input type="text" value={customRoleTitle} onChange={e => setCustomRoleTitle(e.target.value)} placeholder="Community Manager, Grant Writer..." style={inputStyle}
                      onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border} />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <label style={{ fontSize:13, fontWeight:600, color:text }}>Job description / focus area</label>
                    <textarea
                      value={customFocus} onChange={e => setCustomFocus(e.target.value)}
                      placeholder="Describe what your Bloomie should focus on day-to-day..."
                      rows={4}
                      style={{ ...inputStyle, resize:'vertical', fontFamily:'inherit', lineHeight:'1.5' }}
                      onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border}
                    />
                  </div>
                </>
              )}

              {/* Show focus preview for preset roles */}
              {selectedRole && !isCustomRole && (
                <div style={{ background:'#211b24', border:`1px solid ${border}`, borderRadius:10, padding:'12px 14px' }}>
                  <p style={{ margin:'0 0 4px', fontSize:12, fontWeight:700, color:accent }}>
                    {bloomieName.trim() || 'Your Bloomie'}'s focus as {selectedRole.title}:
                  </p>
                  <p style={{ margin:0, fontSize:12, color:sub, lineHeight:'1.5' }}>
                    {selectedRole.focus.split('.').slice(0, 2).join('.') + '.'}
                  </p>
                </div>
              )}
                </>
              )}
            </>
          )}

          {/* ── CREDENTIALS (both modes) ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600, color:text }}>Email address *</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleSignup())}
              placeholder="you@example.com" autoComplete="email" style={inputStyle}
              onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border}
            />
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600, color:text }}>Password *</label>
            <div style={{ position:'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleSignup())}
                placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                style={{ ...inputStyle, paddingRight:44 }}
                onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border}
              />
              <button onClick={() => setShowPassword(p => !p)}
                style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:sub, fontSize:13, padding:4 }}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {mode === 'login' && (
            <div style={{ textAlign:'right', marginTop:-4 }}>
              <button
                onClick={() => { setForgotMode(true); setError(''); setSuccess(''); handleForgotPassword(); }}
                style={{ background:'none', border:'none', color:'#E76F8B', cursor:'pointer', fontSize:12, padding:0, textDecoration:'underline' }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && (
            <p style={{ margin:0, color:'#fca5a5', fontSize:13, padding:'8px 12px', background:'rgba(239,68,68,.12)', border:'1px solid rgba(239,68,68,.25)', borderRadius:8 }}>{error}</p>
          )}
          {success && (
            <p style={{ margin:0, color:'#6ee7b7', fontSize:13, padding:'8px 12px', background:'rgba(16,185,129,.12)', border:'1px solid rgba(52,211,153,.25)', borderRadius:8 }}>{success}</p>
          )}

          <button
            onClick={mode === 'login' ? handleLogin : handleSignup}
            disabled={loading || !email.trim() || !password.trim() || (mode === 'signup' && !signupValid)}
            style={{
              padding:'13px', borderRadius:10, border:'none',
              background: (loading || !email.trim() || !password.trim() || (mode === 'signup' && !signupValid)) ? '#34343a' : `linear-gradient(135deg, #E76F8B, #F4A261)`,
              color:'#fff', fontSize:15, fontWeight:700,
              cursor: (loading || !email.trim() || !password.trim() || (mode === 'signup' && !signupValid)) ? 'not-allowed' : 'pointer', marginTop:4
            }}
          >
            {loading
              ? (mode === 'login' ? 'Signing in...' : (isBookCreator ? 'Creating your Book Creator account...' : isBloomStudio ? 'Creating your Bloom Studio account...' : 'Creating your Bloomie...'))
              : (mode === 'login' ? 'Sign in' : (isBookCreator ? 'Create password & open Book Creator' : isBloomStudio ? 'Create password & open Bloom Studio' : 'Create account & get your Bloomie'))}
          </button>

          <div style={{ textAlign:'center', marginTop:8 }}>
            {mode === 'login' ? (
              <p style={{ margin:0, color:sub, fontSize:13 }}>
                Don't have an account?{' '}
                <button onClick={() => { setMode('signup'); setError(''); setSuccess(''); }}
                  style={{ background:'none', border:'none', color:accent, cursor:'pointer', fontSize:13, fontWeight:600, padding:0, textDecoration:'underline' }}>
                  Sign up
                </button>
              </p>
            ) : (
              <p style={{ margin:0, color:sub, fontSize:13 }}>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                  style={{ background:'none', border:'none', color:accent, cursor:'pointer', fontSize:13, fontWeight:600, padding:0, textDecoration:'underline' }}>
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
      {bookCheckoutOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bloomie Book Creator checkout"
          onClick={() => setBookCheckoutOpen(false)}
          style={{position:'fixed',inset:0,zIndex:10000,background:'rgba(0,0,0,.78)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
        >
          <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:560,height:'min(780px,92dvh)',background:'#18181b',border:`1px solid ${border}`,borderRadius:18,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 24px 80px rgba(0,0,0,.65)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',borderBottom:`1px solid ${border}`}}>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:800,color:text}}>Bloomie Book Creator</div>
                <div style={{fontSize:11,color:sub,marginTop:2}}>Secure one-time checkout powered by Whop</div>
              </div>
              <button aria-label="Close checkout" onClick={()=>setBookCheckoutOpen(false)} style={{width:34,height:34,borderRadius:9,border:`1px solid ${border}`,background:'#222225',color:text,cursor:'pointer',fontSize:19}}>×</button>
            </div>
            <div style={{flex:1,minHeight:0,overflowY:'auto',WebkitOverflowScrolling:'touch'}}>
              <div
                data-whop-checkout-plan-id="plan_SfN6obHBORCwM"
                data-whop-checkout-return-url={`${window.location.origin}/book-creator?billing=success`}
                style={{width:'100%',minHeight:'100%'}}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
