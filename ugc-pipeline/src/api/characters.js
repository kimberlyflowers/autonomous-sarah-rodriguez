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
      .select('id, name, slug, age_group, gender, image_url, metadata')
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (req.query.age_group) query = query.eq('age_group', req.query.age_group);
    if (req.query.gender) query = query.eq('gender', req.query.gender);

    const { data, error } = await query;
    if (error) throw error;

    const characters = (data || []).map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      age_group: c.age_group,
      gender: c.gender,
      image_url: c.image_url,
      _looks: c.metadata?.looks || []
    }));

    res.json({ success: true, characters });
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
      .select('id, name, slug, age_group, gender, image_url, metadata')
      .eq('slug', req.params.slug)
      .eq('active', true)
      .single();

    if (error || !data) return res.status(404).json({ success: false, error: 'Character not found.' });
    res.json({ success: true, character: {
      id: data.id,
      name: data.name,
      slug: data.slug,
      age_group: data.age_group,
      gender: data.gender,
      image_url: data.image_url,
      _looks: data.metadata?.looks || []
    } });
  } catch (err) {
    logger.error('Character lookup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
