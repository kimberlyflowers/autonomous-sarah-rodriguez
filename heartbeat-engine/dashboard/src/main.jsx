import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import MobileApp from './MobileApp.jsx';
import Login from './Login.jsx';
import { supabase } from './supabase.js';

function Root() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const isMobileRoute = window.location.pathname.startsWith('/mobile');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (user === undefined) {
    return (
      <div style={{ minHeight:'100vh', background: isMobileRoute ? '#0d0d0d' : '#f7f7f8', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:32, height:32, border:'3px solid ' + (isMobileRoute ? '#2a2a2e' : '#e5e7eb'), borderTopColor: isMobileRoute ? '#F4A261' : '#7c5cbf', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Mobile route — has its own login screen
  if (isMobileRoute) return <MobileApp user={user} />;

  // Dashboard
  if (!user) return <Login />;
  return <App user={user} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
