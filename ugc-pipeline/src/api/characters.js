// GET /api/characters — global character roster, readable by all tenants
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { getSupabaseConfig } = require('../services/supabase');
const { logger } = require('../services/logger');

const router = express.Router();

function getCharacterClient() {
  const { url, anonKey, available } = getSupabaseConfig();
  if (!available) return null;
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

// GET /api/characters
// Returns all active characters, optionally filtered by age_group or gender
router.get('/', async (req, res) => {
  try {
    const supabase = getCharacterClient();
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Character database not configured.' });
    }

    let query = supabase
      .from('ugc_characters')
      .select('id, name, slug, age_group, gender, image_url')
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (req.query.age_group) query = query.eq('age_group', req.query.age_group);
    if (req.query.gender) query = query.eq('gender', req.query.gender);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ success: true, characters: data || [] });
  } catch (err) {
    logger.error('Characters list error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/characters/:slug — single character lookup
router.get('/:slug', async (req, res) => {
  try {
    const supabase = getCharacterClient();
    if (!supabase) return res.status(503).json({ success: false, error: 'Character database not configured.' });

    const { data, error } = await supabase
      .from('ugc_characters')
      .select('id, name, slug, age_group, gender, image_url')
      .eq('slug', req.params.slug)
      .eq('active', true)
      .single();

    if (error || !data) return res.status(404).json({ success: false, error: 'Character not found.' });
    res.json({ success: true, character: data });
  } catch (err) {
    logger.error('Character lookup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
