import React, { useState } from 'react';
import { supabase } from './supabase.js';

export default function PasswordReset({ user }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const updatePassword = async () => {
    if (!password || !confirmPassword) {
      setError('Enter and confirm your new password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    window.history.replaceState({}, '', '/reset-password');
    setSuccess(true);
    setPassword('');
    setConfirmPassword('');
  };

  const goToLogin = async () => {
    await supabase.auth.signOut();
    window.location.assign('/');
  };

  return (
    <main style={{
      minHeight: '100dvh',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      background: 'linear-gradient(160deg, #fff8f3 0%, #f7f3ff 55%, #ffffff 100%)',
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      <section style={{
        width: 'min(100%, 440px)',
        padding: '32px 28px',
        borderRadius: 20,
        background: '#ffffff',
        border: '1px solid #eee8f4',
        boxShadow: '0 24px 70px rgba(67, 45, 92, 0.14)'
      }}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:24}}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontSize: 20,
            background: 'linear-gradient(135deg, #f59b6b, #e86f8f)'
          }}>✿</div>
          <div>
            <div style={{fontSize:18,fontWeight:800,color:'#241c2c'}}>Bloomie Staffing</div>
            <div style={{fontSize:12,color:'#766b7d'}}>Secure account recovery</div>
          </div>
        </div>

        {success ? (
          <>
            <h1 style={{fontSize:26,lineHeight:1.15,color:'#241c2c',margin:'0 0 10px'}}>Password updated</h1>
            <p style={{fontSize:14,lineHeight:1.6,color:'#6e6375',margin:'0 0 22px'}}>
              Your new password is ready. Return to Bloomie and sign in with it.
            </p>
            <button type="button" onClick={goToLogin} style={primaryButtonStyle}>
              Continue to sign in
            </button>
          </>
        ) : user ? (
          <>
            <h1 style={{fontSize:26,lineHeight:1.15,color:'#241c2c',margin:'0 0 10px'}}>Choose a new password</h1>
            <p style={{fontSize:14,lineHeight:1.6,color:'#6e6375',margin:'0 0 22px'}}>
              Enter a new password for {user.email}.
            </p>
            <label style={labelStyle}>
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !saving) updatePassword();
                }}
                style={inputStyle}
              />
            </label>
            {error && <div role="alert" style={errorStyle}>{error}</div>}
            <button
              type="button"
              onClick={updatePassword}
              disabled={saving}
              style={{...primaryButtonStyle, opacity: saving ? 0.65 : 1}}
            >
              {saving ? 'Updating password…' : 'Update password'}
            </button>
          </>
        ) : (
          <>
            <h1 style={{fontSize:26,lineHeight:1.15,color:'#241c2c',margin:'0 0 10px'}}>Reset link expired</h1>
            <p style={{fontSize:14,lineHeight:1.6,color:'#6e6375',margin:'0 0 22px'}}>
              This password-reset link is invalid or has already been used. Request a fresh link from the Bloomie sign-in page.
            </p>
            <button type="button" onClick={() => window.location.assign('/')} style={primaryButtonStyle}>
              Return to sign in
            </button>
          </>
        )}
      </section>
    </main>
  );
}

const labelStyle = {
  display: 'grid',
  gap: 7,
  marginBottom: 14,
  color: '#382f40',
  fontSize: 13,
  fontWeight: 700
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 46,
  padding: '11px 12px',
  border: '1.5px solid #ded5e6',
  borderRadius: 10,
  background: '#fff',
  color: '#241c2c',
  fontSize: 16,
  outline: 'none'
};

const primaryButtonStyle = {
  width: '100%',
  minHeight: 46,
  border: 0,
  borderRadius: 10,
  cursor: 'pointer',
  background: 'linear-gradient(135deg, #7c5cbf, #9a78d4)',
  color: '#fff',
  fontSize: 14,
  fontWeight: 800
};

const errorStyle = {
  margin: '4px 0 14px',
  padding: '10px 12px',
  borderRadius: 8,
  background: '#fff1f2',
  color: '#be123c',
  fontSize: 13
};
