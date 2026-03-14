import { useState } from 'react';
import { supabase } from './supabase.js';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    // On success, onAuthStateChange in main.jsx handles redirect automatically
  };

  const handleSignup = async () => {
    if (!email.trim() || !password.trim() || !orgName.trim()) return;
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
          industry: industry.trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Signup failed');
        setLoading(false);
        return;
      }
      // Auto-login after signup
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      setLoading(false);
      if (loginError) {
        setSuccess('Account created! Please sign in.');
        setMode('login');
      }
      // On success, onAuthStateChange in main.jsx handles redirect automatically
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

  return (
    <div style={{ minHeight:'100vh', background:'#f7f7f8', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ background:'#ffffff', borderRadius:16, padding:'48px 40px', maxWidth:420, width:'100%', boxShadow:'0 4px 24px rgba(0,0,0,0.08)', border:`1px solid ${border}` }}>

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
            </>
          )}

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
            disabled={loading || !email.trim() || !password.trim() || (mode === 'signup' && !orgName.trim())}
            style={{
              padding:'13px', borderRadius:10, border:'none',
              background: (loading || !email.trim() || !password.trim() || (mode === 'signup' && !orgName.trim())) ? '#d1d5db' : `linear-gradient(135deg, ${accent}, #a78bdb)`,
              color:'#fff', fontSize:15, fontWeight:700,
              cursor: (loading || !email.trim() || !password.trim()) ? 'not-allowed' : 'pointer', marginTop:4
            }}
          >
            {loading ? (mode === 'login' ? 'Signing in…' : 'Creating account…') : (mode === 'login' ? 'Sign in' : 'Create account')}
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
