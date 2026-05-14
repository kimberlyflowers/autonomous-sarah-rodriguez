const { createClient } = require('@supabase/supabase-js');

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const mode = String(process.env.UGC_AUTH_MODE || '').toLowerCase();
  const enabled = ['true', '1', 'yes'].includes(String(process.env.UGC_SUPABASE_ENABLED || '').toLowerCase())
    || mode === 'supabase';
  return {
    url,
    anonKey,
    available: !!(url && anonKey),
    configured: enabled && !!(url && anonKey)
  };
}

function createUserClient(accessToken) {
  const { url, anonKey, configured } = getSupabaseConfig();
  if (!configured) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
    }
  });
}

async function getSignedUrl(supabase, path, expiresIn = 60 * 60) {
  const { data, error } = await supabase.storage
    .from('ugc-assets')
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

module.exports = {
  createUserClient,
  getSignedUrl,
  getSupabaseConfig
};
