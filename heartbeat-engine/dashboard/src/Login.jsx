import { useState } from 'react';
import { supabase } from './supabase.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    });
    setLoading(false);
    if (error) setError(error.message);
    // On success, onAuthStateChange in main.jsx handles the redirect automatically
  };

  const bg = '#f7f7f8';
  const card = '#ffffff';
  const accent = '#7c5cbf';
  const text = '#1a1a2e';
  const sub = '#6b7280';
  const border = '#e5e7eb';

  return (
    <div style={{ minHeight:'100vh', background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ background:card, borderRadius:16, padding:'48px 40px', maxWidth:400, width:'100%', boxShadow:'0 4px 24px rgba(0,0,0,0.08)', border:`1px solid ${border}` }}>
        
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:`linear-gradient(135deg, ${accent}, #a78bdb)`, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}>
            <span style={{ color:'#fff', fontSize:22, fontWeight:800 }}>B</span>
          </div>
          <h1 style={{ margin:'0 0 4px', color:text, fontSize:24, fontWeight:800, letterSpacing:'-0.5px' }}>BLOOM</h1>
          <p style={{ margin:0, color:sub, fontSize:14 }}>Sign in to your dashboard</p>
        </div>

        {/* Form */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600, color:text }}>Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="you@example.com"
              style={{ padding:'12px 16px', borderRadius:10, border:`1.5px solid ${border}`, fontSize:15, color:text, outline:'none', background:'#fafafa' }}
              onFocus={e => e.target.style.borderColor = accent}
              onBlur={e => e.target.style.borderColor = border}
            />
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, fontWeight:600, color:text }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              style={{ padding:'12px 16px', borderRadius:10, border:`1.5px solid ${border}`, fontSize:15, color:text, outline:'none', background:'#fafafa' }}
              onFocus={e => e.target.style.borderColor = accent}
              onBlur={e => e.target.style.borderColor = border}
            />
          </div>

          {error && (
            <p style={{ margin:0, color:'#ef4444', fontSize:13, padding:'8px 12px', background:'#fef2f2', borderRadius:8 }}>
              {error === 'Invalid login credentials' ? 'Wrong email or password.' : error}
            </p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !email.trim() || !password.trim()}
            style={{ padding:'13px', borderRadius:10, border:'none', background: loading || !email.trim() || !password.trim() ? '#d1d5db' : `linear-gradient(135deg, ${accent}, #a78bdb)`, color:'#fff', fontSize:15, fontWeight:700, cursor: loading || !email.trim() || !password.trim() ? 'not-allowed' : 'pointer', marginTop:4 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
