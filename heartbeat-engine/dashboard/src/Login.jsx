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

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
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

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || !orgName.trim() || !bloomieName.trim() || !effectiveTitle) return;
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
          organizationName: orgName.trim(),
          industry: industry.trim() || undefined,
          bloomieName: bloomieName.trim(),
          bloomieRole: effectiveTitle,
          bloomieJobDescription: effectiveFocus || undefined
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

  const accent = '#7c5cbf';
  const text = '#1a1a2e';
  const sub = '#6b7280';
  const border = '#e5e7eb';

  const inputStyle = { padding:'12px 16px', borderRadius:10, border:`1.5px solid ${border}`, fontSize:15, color:text, outline:'none', background:'#fafafa', width:'100%', boxSizing:'border-box' };
  const selectStyle = { ...inputStyle, appearance:'none', backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%236b7280\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")', backgroundRepeat:'no-repeat', backgroundPosition:'right 14px center', paddingRight:36, cursor:'pointer' };

  const signupValid = email.trim() && password.trim() && orgName.trim() && bloomieName.trim() && effectiveTitle;

  return (
    <div style={{ minHeight:'100vh', background:'#f7f7f8', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ background:'#ffffff', borderRadius:16, padding:'48px 40px', maxWidth:440, width:'100%', boxShadow:'0 4px 24px rgba(0,0,0,0.08)', border:`1px solid ${border}`, maxHeight:'90vh', overflowY:'auto' }}>

        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:`linear-gradient(135deg, ${accent}, #a78bdb)`, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
            <span style={{ color:'#fff', fontSize:22, fontWeight:800 }}>B</span>
          </div>
          <h1 style={{ margin:'0 0 4px', color:text, fontSize:24, fontWeight:800, letterSpacing:'-0.5px' }}>BLOOM</h1>
          <p style={{ margin:0, color:sub, fontSize:14 }}>
            {mode === 'login' ? 'Sign in to your dashboard' : 'Create your account & get your Bloomie'}
          </p>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {mode === 'signup' && (
            <>
              {/* ── YOUR INFO ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ fontSize:13, fontWeight:600, color:text }}>Your name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Jane Smith" style={inputStyle}
                  onFocus={e => e.target.style.borderColor = accent} onBlur={e => e.target.style.borderColor = border} />
              </div>
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
                <div style={{ background:'#f8f6ff', border:`1px solid #e8e0f5`, borderRadius:10, padding:'12px 14px' }}>
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

          {error && (
            <p style={{ margin:0, color:'#ef4444', fontSize:13, padding:'8px 12px', background:'#fef2f2', borderRadius:8 }}>{error}</p>
          )}
          {success && (
            <p style={{ margin:0, color:'#059669', fontSize:13, padding:'8px 12px', background:'#f0fdf4', borderRadius:8 }}>{success}</p>
          )}

          <button
            onClick={mode === 'login' ? handleLogin : handleSignup}
            disabled={loading || !email.trim() || !password.trim() || (mode === 'signup' && !signupValid)}
            style={{
              padding:'13px', borderRadius:10, border:'none',
              background: (loading || !email.trim() || !password.trim() || (mode === 'signup' && !signupValid)) ? '#d1d5db' : `linear-gradient(135deg, ${accent}, #a78bdb)`,
              color:'#fff', fontSize:15, fontWeight:700,
              cursor: (loading || !email.trim() || !password.trim() || (mode === 'signup' && !signupValid)) ? 'not-allowed' : 'pointer', marginTop:4
            }}
          >
            {loading ? (mode === 'login' ? 'Signing in...' : 'Creating your Bloomie...') : (mode === 'login' ? 'Sign in' : 'Create account & get your Bloomie')}
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
    </div>
  );
}
