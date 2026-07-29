import { Router } from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { authenticateBookAccess } from './book-auth.js';

const router = Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const AUTHORS_KEY = 'book_author_profiles';

async function loadAuthors(organizationId) {
  const { data, error } = await supabase.from('user_settings')
    .select('value')
    .eq('organization_id', organizationId)
    .eq('key', AUTHORS_KEY)
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? data.value : [];
}

async function saveAuthors(organizationId, authors) {
  const { error } = await supabase.from('user_settings').upsert({
    organization_id: organizationId,
    key: AUTHORS_KEY,
    value: authors,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,key' });
  if (error) throw error;
}

const BOOSTER_RESOURCES = [
  {
    id: 'kindle-cash-multiplier',
    title: 'The Kindle Cash Multiplier Training',
    type: 'Training',
    url: '/assets/book-library/kindle-cash-multiplier-complete.pdf',
    coverUrl: '/assets/book-library/kindle-cash-multiplier-cover.png',
  },
  {
    id: 'kdp-optimization-checklist',
    title: 'Amazon KDP Optimization Checklist',
    type: 'Checklist',
    url: '/assets/book-library/amazon-kdp-checklist-complete.pdf',
    coverUrl: '/assets/book-library/amazon-kdp-optimization-checklist-cover.png',
  },
  {
    id: 'book-description-templates',
    title: 'Done-For-You Book Description Templates',
    type: 'Templates',
    url: '/assets/book-library/book-description-templates-complete.pdf',
    coverUrl: '/assets/book-library/book-description-templates-cover.png',
  },
  {
    id: '30-books-fast-start',
    title: '30 Books in 30 Days Fast-Start Blueprint',
    type: 'Blueprint',
    url: '/assets/book-library/30-books-blueprint-complete.pdf',
    coverUrl: '/assets/book-library/30-books-in-30-days-cover.png',
  },
];

router.get('/access', async (req, res) => {
  try {
    const access = await authenticateBookAccess(req, req.query.agentId || null);
    if (!access.authorized) return res.status(access.status).json({
      error: access.error,
      checkoutRequired: access.checkoutRequired === true,
      checkoutPlan: access.checkoutRequired ? 'book_creator' : undefined,
    });
    return res.json({
      authorized: true,
      workspace: {
        type: 'book_creator',
        organizationId: access.organizationId,
        userId: access.userId,
      },
      entitlement: access.entitlement,
    });
  } catch {
    return res.status(500).json({ error: 'Book Creator authorization check failed' });
  }
});

router.get('/booster', async (req, res) => {
  try {
    const access = await authenticateBookAccess(req, req.query.agentId || null);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });
    const tier = access.entitlement?.tier;
    if (!['booster', 'pro', 'enterprise'].includes(tier)) {
      return res.status(403).json({
        error: 'The Quick-Launch Booster is not included with this Book Creator purchase.',
        upgradeRequired: true,
      });
    }
    return res.json({ authorized: true, resources: BOOSTER_RESOURCES });
  } catch {
    return res.status(500).json({ error: 'Booster access could not be verified' });
  }
});

router.get('/authors', async (req, res) => {
  try {
    const access = await authenticateBookAccess(req, req.query.agentId || null);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });
    const authors = (await loadAuthors(access.organizationId))
      .filter(author => author.status !== 'archived')
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return res.json({ authors });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Author Library could not be loaded' });
  }
});

router.post('/authors', async (req, res) => {
  try {
    const access = await authenticateBookAccess(req, req.body?.agentId || null);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Author name is required' });
    const now = new Date().toISOString();
    const author = {
      id: crypto.randomUUID(),
      organization_id: access.organizationId,
      created_by: access.userId,
      name,
      biography: String(req.body?.biography || '').trim(),
      voice_direction: String(req.body?.voiceDirection || '').trim(),
      reference_ids: Array.isArray(req.body?.referenceIds) ? req.body.referenceIds.filter(Boolean).slice(0, 20) : [],
      headshot_url: String(req.body?.headshotUrl || '').trim() || null,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    const authors = await loadAuthors(access.organizationId);
    authors.unshift(author);
    await saveAuthors(access.organizationId, authors.slice(0, 100));
    return res.status(201).json({ author });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Author profile could not be created' });
  }
});

router.patch('/authors/:id', async (req, res) => {
  try {
    const access = await authenticateBookAccess(req, req.body?.agentId || null);
    if (!access.authorized) return res.status(access.status).json({ error: access.error });
    const authors = await loadAuthors(access.organizationId);
    const index = authors.findIndex(author => author.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Author profile not found' });
    const allowed = {};
    if ('name' in req.body) allowed.name = String(req.body.name || '').trim();
    if ('biography' in req.body) allowed.biography = String(req.body.biography || '').trim();
    if ('voiceDirection' in req.body) allowed.voice_direction = String(req.body.voiceDirection || '').trim();
    if ('referenceIds' in req.body && Array.isArray(req.body.referenceIds)) allowed.reference_ids = req.body.referenceIds.filter(Boolean).slice(0, 20);
    if ('headshotUrl' in req.body) allowed.headshot_url = String(req.body.headshotUrl || '').trim() || null;
    if ('status' in req.body && ['active', 'archived'].includes(req.body.status)) allowed.status = req.body.status;
    authors[index] = { ...authors[index], ...allowed, updated_at: new Date().toISOString() };
    await saveAuthors(access.organizationId, authors);
    return res.json({ author: authors[index] });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Author profile could not be updated' });
  }
});

export default router;
