import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';
import { extractUserId, getUserOrgId, validateAgentAccess } from './org-boundary.js';
import { executeGHLTool } from '../tools/ghl-tools.js';
import { extractReferenceText } from '../references/text-extractor.js';

const router = express.Router();
const logger = createLogger('references-api');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const CATEGORIES = new Set(['identity', 'writing_style', 'brand', 'knowledge', 'heygen', 'project']);
const SCOPES = new Set(['agent', 'organization', 'project', 'chat']);
const SETTINGS_KEY = 'reference_library';

async function loadOrgReferences(orgId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('value')
    .eq('organization_id', orgId)
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? data.value : [];
}

async function saveOrgReferences(orgId, references) {
  const { error } = await supabase.from('user_settings').upsert({
    organization_id: orgId,
    key: SETTINGS_KEY,
    value: references,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organization_id,key' });
  if (error) throw error;
}

function safeName(value = 'reference') {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'reference';
}

async function resolveBoundary(req, { agentId = null, projectId = null, scope = 'agent' } = {}) {
  const orgId = await getUserOrgId(req);
  const userId = extractUserId(req);
  if (!orgId || !userId) return { error: 'Authentication required', status: 401 };

  if (scope === 'agent') {
    if (!agentId) return { error: 'Choose a Bloomie for an employee reference', status: 400 };
    const access = await validateAgentAccess(req, agentId);
    if (!access.authorized) return { error: access.error, status: access.status };
  }

  if (scope === 'project') {
    if (!projectId) return { error: 'Choose a project for a project reference', status: 400 };
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project || project.user_id !== userId) {
      return { error: 'Project not found in your organization', status: 404 };
    }
  }

  return { orgId, userId };
}

router.get('/', async (req, res) => {
  try {
    const scope = SCOPES.has(req.query.scope) ? req.query.scope : null;
    const boundary = await resolveBoundary(req, {
      agentId: req.query.agentId || null,
      projectId: req.query.projectId || null,
      scope: scope || 'organization',
    });
    if (boundary.error) return res.status(boundary.status).json({ error: boundary.error });

    let references = (await loadOrgReferences(boundary.orgId)).filter(item => item.status === 'active');
    if (scope) references = references.filter(item => item.scope === scope);
    if (req.query.agentId) references = references.filter(item => item.scope === 'organization' || item.agent_id === req.query.agentId);
    if (req.query.projectId) references = references.filter(item => item.scope === 'organization' || item.project_id === req.query.projectId);
    if (CATEGORIES.has(req.query.category)) references = references.filter(item => item.category === req.query.category);
    references.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    res.json({ references: references.slice(0, 200) });
  } catch (error) {
    logger.error('Reference list failed', { error: error.message });
    res.status(500).json({ error: 'Could not load references' });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const {
      file, title, description = '', category = 'knowledge', scope = 'agent',
      agentId = null, projectId = null, approved = false,
    } = req.body || {};
    if (!file?.data || !file?.name || !file?.type) return res.status(400).json({ error: 'A file is required' });
    if (!CATEGORIES.has(category)) return res.status(400).json({ error: 'Invalid reference category' });
    if (!SCOPES.has(scope)) return res.status(400).json({ error: 'Invalid reference scope' });
    if (category === 'identity' || category === 'heygen') {
      if (!file.type.startsWith('image/')) return res.status(400).json({ error: 'Identity and HeyGen references must be images' });
      if (scope !== 'agent') return res.status(400).json({ error: 'Employee identity references must belong to one Bloomie' });
    }

    const boundary = await resolveBoundary(req, { agentId, projectId, scope });
    if (boundary.error) return res.status(boundary.status).json({ error: boundary.error });

    const buffer = Buffer.from(file.data, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'The uploaded file is empty' });
    if (buffer.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'References must be 20 MB or smaller' });

    const referenceId = crypto.randomUUID();
    const storagePath = `reference-library/${boundary.orgId}/${referenceId}/${safeName(file.name)}`;
    const bucket = file.type.startsWith('image/') ? 'bloom-images' : 'bloom-artifacts';
    let storageUrl = null;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    if (bucket === 'bloom-images') {
      storageUrl = supabase.storage.from(bucket).getPublicUrl(storagePath).data?.publicUrl || null;
    } else {
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      storageUrl = signed?.signedUrl || null;
    }

    let extraction = null;
    let extractionError = null;
    try {
      extraction = await extractReferenceText(file, {
        onLocalPdfError: error => logger.warn('Local PDF extraction failed; trying OCR', { name: file.name, error: error.message }),
      });
    } catch (error) {
      extractionError = error.message;
      logger.warn('Reference text extraction failed', { name: file.name, error: error.message });
    }
    const ghlEligible = category === 'knowledge' && scope === 'organization' && approved;
    const now = new Date().toISOString();
    const row = {
      id: referenceId,
      organization_id: boundary.orgId,
      agent_id: scope === 'agent' ? agentId : null,
      project_id: scope === 'project' ? projectId : null,
      uploaded_by: boundary.userId,
      scope,
      category,
      title: String(title || file.name).trim(),
      description: String(description || '').trim() || null,
      mime_type: file.type,
      file_size: buffer.length,
      storage_path: `${bucket}/${storagePath}`,
      storage_url: storageUrl,
      extracted_text: extraction?.text || null,
      extraction_status: extraction?.text ? 'ready' : extractionError ? 'failed' : 'not_applicable',
      extraction_method: extraction?.method || null,
      extraction_error: extractionError,
      extracted_at: extraction?.text ? now : null,
      approved: !!approved,
      ghl_sync_status: ghlEligible ? 'eligible' : 'not_eligible',
      metadata: { originalName: file.name },
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    const references = await loadOrgReferences(boundary.orgId);
    references.unshift(row);
    await saveOrgReferences(boundary.orgId, references.slice(0, 500));
    res.status(201).json({ reference: row });
  } catch (error) {
    logger.error('Reference upload failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Could not upload reference' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const boundary = await resolveBoundary(req, { scope: 'organization' });
    if (boundary.error) return res.status(boundary.status).json({ error: boundary.error });
    const allowed = {};
    for (const key of ['title', 'description', 'approved', 'status']) {
      if (key in req.body) allowed[key] = req.body[key];
    }
    if (req.body.category && CATEGORIES.has(req.body.category)) allowed.category = req.body.category;
    const references = await loadOrgReferences(boundary.orgId);
    const index = references.findIndex(item => item.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Reference not found' });
    const current = references[index];
    if ('approved' in allowed) {
      allowed.ghl_sync_status = allowed.approved && current?.category === 'knowledge' && current?.scope === 'organization'
        ? 'eligible'
        : 'not_eligible';
    }
    allowed.updated_at = new Date().toISOString();
    references[index] = { ...current, ...allowed };
    await saveOrgReferences(boundary.orgId, references);
    res.json({ reference: references[index] });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not update reference' });
  }
});

router.post('/:id/reprocess', async (req, res) => {
  try {
    const boundary = await resolveBoundary(req, { scope: 'organization' });
    if (boundary.error) return res.status(boundary.status).json({ error: boundary.error });
    const references = await loadOrgReferences(boundary.orgId);
    const index = references.findIndex(item => item.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Reference not found' });
    const current = references[index];
    const [bucket, ...pathParts] = String(current.storage_path || '').split('/');
    if (!bucket || !pathParts.length) return res.status(400).json({ error: 'Original reference file is unavailable' });
    const { data, error: downloadError } = await supabase.storage.from(bucket).download(pathParts.join('/'));
    if (downloadError) throw downloadError;
    const buffer = Buffer.from(await data.arrayBuffer());
    try {
      const extraction = await extractReferenceText({
        data: buffer.toString('base64'),
        name: current.metadata?.originalName || current.title || 'reference',
        type: current.mime_type,
      });
      if (!extraction?.text) return res.status(400).json({ error: 'This file type does not support text extraction' });
      references[index] = {
        ...current,
        extracted_text: extraction.text,
        extraction_status: 'ready',
        extraction_method: extraction.method,
        extraction_error: null,
        extracted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      references[index] = {
        ...current,
        extraction_status: 'failed',
        extraction_error: error.message,
        updated_at: new Date().toISOString(),
      };
      await saveOrgReferences(boundary.orgId, references);
      return res.status(422).json({ error: error.message, reference: references[index] });
    }
    await saveOrgReferences(boundary.orgId, references);
    res.json({ reference: references[index] });
  } catch (error) {
    logger.error('Reference reprocessing failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Could not process reference' });
  }
});

router.post('/:id/sync-ghl', async (req, res) => {
  try {
    const boundary = await resolveBoundary(req, { scope: 'organization' });
    if (boundary.error) return res.status(boundary.status).json({ error: boundary.error });
    const references = await loadOrgReferences(boundary.orgId);
    const index = references.findIndex(item => item.id === req.params.id);
    const reference = index >= 0 ? references[index] : null;
    if (!reference) return res.status(404).json({ error: 'Reference not found' });
    if (reference.category !== 'knowledge' || reference.scope !== 'organization' || !reference.approved) {
      return res.status(400).json({ error: 'Only approved, all-Bloomies knowledge can be synced to GHL' });
    }
    const answer = String(req.body?.answer || reference.extracted_text || reference.description || '').trim();
    const question = String(req.body?.question || reference.title || '').trim();
    if (!question || !answer) return res.status(400).json({ error: 'A question/title and extracted answer are required for GHL sync' });

    references[index] = { ...reference, ghl_sync_status: 'pending', updated_at: new Date().toISOString() };
    await saveOrgReferences(boundary.orgId, references);
    const result = await executeGHLTool('ghl_create_knowledge_base_faq', {
      question,
      answer: answer.slice(0, 30000),
      knowledgeBaseId: req.body?.knowledgeBaseId || reference.ghl_knowledge_base_id || undefined,
    }, boundary.orgId);
    const failed = result?._status === 'FAILED' || result?.success === false || result?.error;
    if (failed) {
      references[index] = { ...references[index],
        ghl_sync_status: 'failed',
        metadata: { ...(reference.metadata || {}), ghlLastError: result?._message || result?.error || 'GHL sync failed' },
        updated_at: new Date().toISOString(),
      };
      await saveOrgReferences(boundary.orgId, references);
      return res.status(502).json({ error: result?._message || result?.error || 'GHL sync failed' });
    }
    const knowledgeBaseId = result?.data?.knowledgeBaseId || result?.knowledgeBaseId || reference.ghl_knowledge_base_id || null;
    const updated = {
      ...references[index],
      ghl_sync_status: 'synced',
      ghl_knowledge_base_id: knowledgeBaseId,
      ghl_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    references[index] = updated;
    await saveOrgReferences(boundary.orgId, references);
    res.json({ reference: updated, result });
  } catch (error) {
    logger.error('GHL reference sync failed', { error: error.message });
    res.status(500).json({ error: error.message || 'Could not sync reference to GHL' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const boundary = await resolveBoundary(req, { scope: 'organization' });
    if (boundary.error) return res.status(boundary.status).json({ error: boundary.error });
    const references = await loadOrgReferences(boundary.orgId);
    const index = references.findIndex(item => item.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Reference not found' });
    references[index] = { ...references[index], status: 'archived', updated_at: new Date().toISOString() };
    await saveOrgReferences(boundary.orgId, references);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not remove reference' });
  }
});

export default router;
