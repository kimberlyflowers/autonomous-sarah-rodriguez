// GET  /api/settings         — returns masked tenant settings
// PUT  /api/settings         — upserts one or more keys
// DELETE /api/settings/:key  — removes a key

const express = require('express');
const { hasDatabase, getTenantSetting, setTenantSetting, deleteTenantSetting } = require('../services/postgres');

const router = express.Router();

// Keys we allow tenants to store (and how to mask them in GET responses)
const ALLOWED_KEYS = {
  elevenlabs_api_key: { label: 'ElevenLabs API Key', mask: true },
  elevenlabs_default_voice: { label: 'ElevenLabs Default Voice ID', mask: false }
};

function maskValue(value) {
  if (!value || value.length < 8) return value ? '••••••••' : null;
  return value.slice(0, 4) + '••••' + value.slice(-4);
}

// GET /api/settings — returns all keys with masked values + connected booleans
router.get('/', async (req, res) => {
  const tenantSlug = req.tenant?.id || req.tenant?.slug;
  if (!tenantSlug) return res.status(401).json({ error: 'Not authenticated.' });

  if (!hasDatabase()) {
    // Fallback: report env-var status when no DB
    return res.json({
      settings: {
        elevenlabs_api_key: {
          set: !!process.env.ELEVENLABS_API_KEY,
          masked: process.env.ELEVENLABS_API_KEY ? maskValue(process.env.ELEVENLABS_API_KEY) : null,
          source: 'env'
        }
      }
    });
  }

  const out = {};
  for (const [key, meta] of Object.entries(ALLOWED_KEYS)) {
    const raw = await getTenantSetting(tenantSlug, key).catch(() => null);
    out[key] = {
      set: !!raw,
      masked: raw && meta.mask ? maskValue(raw) : (raw || null),
      source: raw ? 'tenant' : (process.env[key.toUpperCase()] ? 'env' : 'none')
    };
  }

  res.json({ settings: out });
});

// PUT /api/settings — body: { elevenlabs_api_key: "sk-...", ... }
router.put('/', async (req, res) => {
  const tenantSlug = req.tenant?.id || req.tenant?.slug;
  if (!tenantSlug) return res.status(401).json({ error: 'Not authenticated.' });
  if (!hasDatabase()) return res.status(503).json({ error: 'Database not configured.' });

  const updates = {};
  for (const [key] of Object.entries(ALLOWED_KEYS)) {
    if (req.body[key] !== undefined) {
      const val = String(req.body[key] || '').trim();
      if (val) {
        await setTenantSetting(tenantSlug, key, val);
        updates[key] = 'saved';
      } else {
        await deleteTenantSetting(tenantSlug, key);
        updates[key] = 'removed';
      }
    }
  }

  res.json({ success: true, updates });
});

// DELETE /api/settings/:key — remove a single key
router.delete('/:key', async (req, res) => {
  const tenantSlug = req.tenant?.id || req.tenant?.slug;
  if (!tenantSlug) return res.status(401).json({ error: 'Not authenticated.' });
  if (!hasDatabase()) return res.status(503).json({ error: 'Database not configured.' });

  const key = req.params.key;
  if (!ALLOWED_KEYS[key]) return res.status(400).json({ error: `Unknown setting key: ${key}` });

  await deleteTenantSetting(tenantSlug, key);
  res.json({ success: true });
});

module.exports = router;
