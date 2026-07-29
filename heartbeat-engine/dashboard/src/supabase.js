import { createClient } from '@supabase/supabase-js';

// Public fallbacks (same values already shipped in BloomieAdmin.jsx) so the
// app never hard-crashes at module load if VITE_ env vars are missing at build time.
const FALLBACK_SUPABASE_URL = 'https://njfhzabmaxhfzekbzpzz.supabase.co';
const FALLBACK_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5qZmh6YWJtYXhoZnpla2J6cHp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjYwMjMsImV4cCI6MjA4ODQwMjAyM30.QPTQhnlfZtmfQVm75GqG0Oazmyb7USjYBdLEy_G-iqU';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

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
