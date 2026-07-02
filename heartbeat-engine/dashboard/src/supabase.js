import { createClient } from '@supabase/supabase-js';

const runtimeConfig = window.__BLOOMIE_DASHBOARD_CONFIG__ || {};
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || runtimeConfig.supabaseUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Bloomie dashboard is missing Supabase public config');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Get current session user
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Get JWT for API calls
export async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};
  return { 'Authorization': `Bearer ${session.access_token}` };
}

// Sign out
export async function signOut() {
  await supabase.auth.signOut();
}
