import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { getUserOrgId } from './org-boundary.js';
import crypto from 'crypto';
import { executeGHLTool } from '../tools/ghl-tools.js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const SUPPORT_ANSWERS_KEY = 'support_answers';
const PRIMARY_ORG_ID = 'a1000000-0000-0000-0000-000000000001';

async function loadSupportAnswers(organizationId) {
  const { data, error } = await supabase.from('user_settings')
    .select('value')
    .eq('organization_id', organizationId)
    .eq('key', SUPPORT_ANSWERS_KEY)
    .maybeSingle();
  if (error) throw error;
  if (Array.isArray(data?.value)) return data.value;
  if (organizationId !== PRIMARY_ORG_ID) return [];
  const { data: legacy, error: legacyError } = await supabase.from('bloomie_kb').select('*').order('created_at', { ascending: false }).limit(200);
  if (legacyError) return [];
  const migrated = (legacy || []).map(row => ({ ...row, id: row.id || crypto.randomUUID(), status: 'active', ghl_sync_status: 'not_synced' }));
  if (migrated.length) await saveSupportAnswers(organizationId, migrated);
  return migrated;
}

async function saveSupportAnswers(organizationId, answers) {
  const { error } = await supabase.from('user_settings').upsert({
    organization_id: organizationId,
    key: SUPPORT_ANSWERS_KEY,
    value: answers,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,key' });
  if (error) throw error;
}

async function tenant(req, res) {
  const organizationId = await getUserOrgId(req);
  if (!organizationId) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return organizationId;
}

router.get('/tickets', async (req, res) => {
  try {
    const organizationId = await tenant(req, res);
    if (!organizationId) return;
    let query = supabase
      .from('bloomie_tickets')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (req.query.status && req.query.status !== 'all') query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ tickets: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not load tickets' });
  }
});

router.patch('/tickets/:id', async (req, res) => {
  try {
    const organizationId = await tenant(req, res);
    if (!organizationId) return;
    const allowed = {};
    for (const key of ['status', 'priority', 'resolution_notes']) {
      if (key in (req.body || {})) allowed[key] = req.body[key];
    }
    if (!Object.keys(allowed).length) return res.status(400).json({ error: 'No supported updates supplied' });
    const { data, error } = await supabase
      .from('bloomie_tickets')
      .update(allowed)
      .eq('id', req.params.id)
      .eq('organization_id', organizationId)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Ticket not found in this tenant' });
    res.json({ ticket: data });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not update ticket' });
  }
});

router.get('/support-answers', async (req, res) => {
  try {
    const organizationId = await tenant(req, res);
    if (!organizationId) return;
    const answers = (await loadSupportAnswers(organizationId)).filter(answer => answer.status !== 'archived');
    res.json({ answers });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not load support answers' });
  }
});

router.post('/support-answers', async (req, res) => {
  try {
    const organizationId = await tenant(req, res);
    if (!organizationId) return;
    const question = String(req.body?.question || '').trim();
    const answer = String(req.body?.answer || '').trim();
    if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required' });
    const answers = await loadSupportAnswers(organizationId);
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      question,
      answer,
      category: String(req.body?.category || 'general').trim() || 'general',
      keywords: Array.isArray(req.body?.keywords) ? req.body.keywords.map(String) : [],
      status: 'active',
      ghl_sync_status: 'not_synced',
      hit_count: 0,
      created_at: now,
      updated_at: now,
    };
    answers.unshift(row);
    await saveSupportAnswers(organizationId, answers.slice(0, 500));
    res.status(201).json({ answer: row });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not create support answer' });
  }
});

router.patch('/support-answers/:id', async (req, res) => {
  try {
    const organizationId = await tenant(req, res);
    if (!organizationId) return;
    const answers = await loadSupportAnswers(organizationId);
    const index = answers.findIndex(answer => answer.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Support answer not found in this tenant' });
    const allowed = {};
    for (const key of ['question', 'answer', 'category']) if (key in (req.body || {})) allowed[key] = String(req.body[key]).trim();
    if (Array.isArray(req.body?.keywords)) allowed.keywords = req.body.keywords.map(String);
    answers[index] = { ...answers[index], ...allowed, ghl_sync_status: 'needs_sync', updated_at: new Date().toISOString() };
    await saveSupportAnswers(organizationId, answers);
    res.json({ answer: answers[index] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not update support answer' });
  }
});

router.delete('/support-answers/:id', async (req, res) => {
  try {
    const organizationId = await tenant(req, res);
    if (!organizationId) return;
    const answers = await loadSupportAnswers(organizationId);
    const index = answers.findIndex(answer => answer.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Support answer not found in this tenant' });
    answers[index] = { ...answers[index], status: 'archived', updated_at: new Date().toISOString() };
    await saveSupportAnswers(organizationId, answers);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not remove support answer' });
  }
});

router.post('/support-answers/:id/sync-ghl', async (req, res) => {
  try {
    const organizationId = await tenant(req, res);
    if (!organizationId) return;
    const answers = await loadSupportAnswers(organizationId);
    const index = answers.findIndex(answer => answer.id === req.params.id && answer.status !== 'archived');
    if (index < 0) return res.status(404).json({ error: 'Support answer not found in this tenant' });
    const current = answers[index];
    const result = await executeGHLTool('ghl_create_knowledge_base_faq', {
      question: current.question,
      answer: current.answer,
      knowledgeBaseId: req.body?.knowledgeBaseId || undefined,
    }, organizationId);
    const failed = result?._status === 'FAILED' || result?.success === false || result?.error;
    answers[index] = {
      ...current,
      ghl_sync_status: failed ? 'failed' : 'synced',
      ghl_sync_error: failed ? result?._message || result?.error || 'GHL sync failed' : null,
      ghl_synced_at: failed ? current.ghl_synced_at || null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveSupportAnswers(organizationId, answers);
    if (failed) return res.status(502).json({ error: answers[index].ghl_sync_error, answer: answers[index] });
    res.json({ answer: answers[index], result });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not sync support answer to GHL' });
  }
});

export default router;
