import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import MobileApp from './MobileApp.jsx';
import Login from './Login.jsx';
import PasswordReset from './PasswordReset.jsx';
import { supabase } from './supabase.js';

// pdfjs-dist 5 uses the newer static URL.parse() API when resolving links.
// Safari and older Chromium builds do not expose it yet, so keep PDF links
// working there with the same null-on-invalid contract as URL.parse().
if (typeof URL.parse !== 'function') {
  URL.parse = (input, base) => {
    try {
      return base == null ? new URL(input) : new URL(input, base);
    } catch {
      return null;
    }
  };
}

function Root() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => new URLSearchParams(window.location.search).get('reset') === '1'
  );
  const isMobileRoute = window.location.pathname.startsWith('/mobile')
    || window.location.pathname.startsWith('/dispatch');
  const isBookCreatorRoute = window.location.pathname.startsWith('/book-creator');
  const isBookCheckoutRoute = window.location.pathname.startsWith('/book-creator/checkout');
  const isBloomStudioRoute = window.location.pathname.startsWith('/studio');
  const isPasswordResetRoute = window.location.pathname === '/reset-password'
    || new URLSearchParams(window.location.search).get('reset') === '1';

  useEffect(() => {
    let active = true;
    const initializeSession = async () => {
      if (window.bloomDesktop?.isDesktop) {
        try {
          const restored = await window.bloomDesktop.restoreSession();
          if (restored?.success && restored.session?.access_token && restored.session?.refresh_token) {
            await supabase.auth.setSession(restored.session);
          }
        } catch (error) {
          console.warn('Desktop session restore skipped:', error?.message || error);
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (active) setUser(session?.user ?? null);
      if (session && window.bloomDesktop?.isDesktop) {
        window.bloomDesktop.registerSession(session).catch(() => {});
      }
    };
    initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setUser(session?.user ?? null);
      if (session && window.bloomDesktop?.isDesktop) {
        window.bloomDesktop.registerSession(session).catch(() => {});
      } else if (event === 'SIGNED_OUT' && window.bloomDesktop?.isDesktop) {
        window.bloomDesktop.clearSession().catch(() => {});
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // The standalone Book Creator and the Book Studio inside Bloomie Staffing
  // are two routes in this same bundle. Detect a newer Railway deployment so
  // an already-open PWA/desktop tab cannot remain pinned to an older UI.
  useEffect(() => {
    let active = true;
    let loadedVersion = null;

    const checkForUpdate = async () => {
      try {
        const response = await fetch('/health', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const nextVersion = payload?.version;
        if (!nextVersion || nextVersion === 'local') return;
        if (loadedVersion && nextVersion !== loadedVersion && active) {
          const url = new URL(window.location.href);
          url.searchParams.set('_bloom_build', nextVersion.slice(0, 12));
          window.location.replace(url.toString());
          return;
        }
        loadedVersion = nextVersion;
      } catch {
        // A transient health-check failure should never interrupt active work.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    checkForUpdate();
    const timer = window.setInterval(checkForUpdate, 60_000);
    window.addEventListener('focus', checkForUpdate);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', checkForUpdate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  if (user === undefined) {
    return (
      <div style={{ minHeight:'100vh', background: '#FFFFFF', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:32, height:32, border:'3px solid #E5E7EB', borderTopColor: isMobileRoute ? '#E8845A' : '#7c5cbf', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (isPasswordResetRoute) return <PasswordReset user={user} />;

  // Mobile route — has its own login screen
  if (isMobileRoute) return <MobileApp user={user} />;

  // Public, directly addressable embedded checkout. This intentionally renders
  // before the authenticated dashboard so full-access operators can test it.
  if (isBookCheckoutRoute) return <Login product="book_creator" initialBookCheckout />;

  // Dashboard
  if (!user) return <Login product={isBookCreatorRoute ? 'book_creator' : isBloomStudioRoute ? 'bloom_studio' : 'bloomie'} />;
  return <App user={user} passwordRecovery={passwordRecovery} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
