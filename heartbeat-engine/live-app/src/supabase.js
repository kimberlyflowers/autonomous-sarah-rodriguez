import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ||
  'https://njfhzabmaxhfzekbzpzz.supabase.co';
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_HT2shgPJzeOIbCJy20EsVg_qIRauR1E';
export const googleOAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_OAUTH === 'true';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function sendMagicLink(email) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
}
