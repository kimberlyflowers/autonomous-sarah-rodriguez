// BLOOM Files API — artifact storage, file serving, and deliverables library
// Source of truth: Supabase artifacts table + Supabase Storage (bloom-artifacts bucket)
// Railway disk used only as write-through cache for content_text and binary files

import { Router } from 'express';
import { createLogger } from '../logging/logger.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { validateAgentAccess, getUserOrgId, extractUserId } from './org-boundary.js';

const logger = createLogger('files-api');
const router = Router();

const FILE_STORAGE = process.env.FILE_STORAGE_PATH || path.join(process.cwd(), 'bloom-files');
if (!fs.existsSync(FILE_STORAGE)) fs.mkdirSync(FILE_STORAGE, { recursive: true });

const ORG_ID    = () => process.env.BLOOM_ORG_ID        || 'a1000000-0000-0000-0000-000000000001';
const USER_ID   = () => process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';
const AGENT_ID  = () => process.env.AGENT_UUID          || 'c3000000-0000-0000-0000-000000000003';

function sb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

// ── CREATE ARTIFACT ──────────────────────────────────────────────────────────
router.post('/artifacts', async (req, res) => {
  try {
    const { name, description = '', fileType = 'text', mimeType = 'text/plain', content, sessionId = null, agentId = null, metadata = {} } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content required' });

    // ── Org-boundary: if agentId provided, verify ownership ──
    if (agentId) {
      const access = await validateAgentAccess(req, agentId);
      if (!access.authorized) return res.status(access.status).json({ error: access.error });
    }

    const fileId = `art_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let filePath = null, fileSize = 0, contentText = null, storagePath = null;

    if (fileType === 'image') {
      const buffer = Buffer.from(content, 'base64');
      const ext = mimeType.includes('png') ? '.png' : mimeType.includes('gif') ? '.gif' : '.jpg';
      filePath = path.join(FILE_STORAGE, `${fileId}${ext}`);
      fs.writeFileSync(filePath, buffer);
      fileSize = buffer.length;

      // Upload to Supabase Storage for permanent CDN URL
      try {
        const supabase = sb();
        const storageKey = `artifacts/${fileId}${ext}`;
        const { error: upErr } = await supabase.storage.from('bloom-artifacts').upload(storageKey, buffer, { contentType: mimeType, upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('bloom-artifacts').getPublicUrl(storageKey);
          storagePath = urlData?.publicUrl || null;
        }
      } catch (e) { logger.warn('Supabase Storage upload failed', { error: e.message }); }

    } else if (fileType === 'document' || fileType === 'pdf') {
      const buffer = Buffer.from(content, 'base64');
      const ext = mimeType.includes('pdf') ? '.pdf' : mimeType.includes('word') ? '.docx' : '.bin';
      filePath = path.join(FILE_STORAGE, `${fileId}${ext}`);
      fs.writeFileSync(filePath, buffer);
      fileSize = buffer.length;
    } else {
      contentText = content;
      fileSize = Buffer.byteLength(content, 'utf8');
      const ext = fileType === 'html' ? '.html' : fileType === 'code' ? '.js' : '.md';
      filePath = path.join(FILE_STORAGE, `${fileId}${ext}`);
      fs.writeFileSync(filePath, content, 'utf8');
    }

    const floralId = `bloom-${fileId}`;
    const supabase = sb();

    // ── Multi-tenant: resolve org + user from JWT, or from body (internal calls) ──
    // Internal calls from create_artifact tool have no JWT — they pass organizationId in body
    const resolvedOrgId = await getUserOrgId(req)
      || req.body.organizationId   // ← passed by create_artifact tool for internal calls
      || ORG_ID();
    const resolvedUserId = extractUserId(req) || USER_ID();

    // Check if same name + session already exists — update in place, no duplicates
    let artifact, insertErr;
    if (sessionId) {
      const { data: existing } = await supabase.from('artifacts')
        .select('id').eq('organization_id', resolvedOrgId).eq('name', name).eq('session_id', sessionId).maybeSingle();
      if (existing) {
        const { data: updated, error: updateErr } = await supabase.from('artifacts')
          .update({ description, content: contentText || null, storage_path: storagePath || filePath || null,
            file_size: fileSize, file_type: fileType, mime_type: mimeType })
          .eq('id', existing.id).select('id').single();
        artifact = updated; insertErr = updateErr;
      }
    }
    if (!artifact && !insertErr) {
      const { data: inserted, error: err } = await supabase.from('artifacts').insert({
        organization_id: resolvedOrgId, created_by_user_id: resolvedUserId, agent_id: agentId || AGENT_ID(),
        session_id: sessionId || null, name, description, file_type: fileType, mime_type: mimeType,
        content: contentText || null, storage_path: storagePath || filePath || null,
        file_size: fileSize, floral_id: floralId, bloomshield_registered: false, published: true
      }).select('id').single();
      artifact = inserted; insertErr = err;
    }

    if (insertErr) {
      logger.error('Supabase artifact save failed', { error: insertErr.message });
      return res.status(500).json({ error: 'Failed to save artifact: ' + insertErr.message });
    }

    logger.info('Artifact created in Supabase', { fileId, supabaseId: artifact.id, name, fileType });

    // Async: BLOOMSHIELD registration
    queueBloomshield({ supabaseId: artifact.id, floralId, contentText, name, mimeType, orgId: resolvedOrgId }).catch(() => {});

    return res.json({
      success: true,
      artifact: {
        id: artifact.id,
        fileId,
        name,
        status: 'approved',
        createdAt: new Date().toISOString(),
        downloadUrl: `/api/files/download/${fileId}`,
        previewUrl: `/api/files/preview/${fileId}`,
        bloomshieldPending: true
      }
    });
  } catch (error) {
    logger.error('Create artifact error', { error: error.message });
    return res.status(500).json({ error: 'Failed to create artifact' });
  }
});

async function queueBloomshield({ supabaseId, floralId, contentText, name, mimeType, orgId }) {
  try {
    const supabase = sb();
    const contentHash = crypto.createHash('sha256').update(contentText || name).digest('hex');
    const { data: shieldReg, error } = await supabase.from('bloomshield_registrations').insert({
      artifact_id: supabaseId,
      owner_org_id: orgId || ORG_ID(),
      owner_wallet_address: process.env.BLOOM_WALLET_ADDRESS || 'pending',
      floral_id: floralId,
      content_hash: contentHash,
      registration_status: 'pending'
    }).select('id').single();
    if (error) { logger.warn('BLOOMSHIELD insert failed', { error: error.message }); return; }
    await supabase.from('artifacts').update({ bloomshield_registered: true, bloomshield_registration_id: shieldReg.id }).eq('id', supabaseId);
    logger.info('BLOOMSHIELD queued', { floralId, registrationId: shieldReg.id });
  } catch (e) { logger.warn('queueBloomshield error', { error: e.message }); }
}

// ── LIST ARTIFACTS ───────────────────────────────────────────────────────────
router.get('/artifacts', async (req, res) => {
  try {
    const { status, limit = 500, sessionId, agentId } = req.query;

    // ── Org-boundary: if agentId specified, verify ownership ──
    if (agentId) {
      const access = await validateAgentAccess(req, agentId);
      if (!access.authorized) return res.status(access.status).json({ error: access.error });
    }

    const supabase = sb();
    // ── Multi-tenant: scope to user's org ──
    const resolvedOrgId = await getUserOrgId(req) || ORG_ID();

    let query = supabase.from('artifacts')
      .select('id, name, description, file_type, mime_type, file_size, storage_path, content, floral_id, published, slug, created_at, bloomshield_registered, session_id, agent_id')
      .eq('organization_id', resolvedOrgId)  // Enforce org boundary on all artifact listings
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // All artifacts are auto-approved now — no status filter needed unless explicitly requested
    if (status) query = query.eq('published', status === 'approved');
    if (sessionId) query = query.eq('session_id', sessionId);
    if (agentId) query = query.eq('agent_id', agentId);

    const { data, error } = await query;
    if (error) throw error;

    const artifacts = (data || []).map(r => ({
      id: r.id,
      fileId: r.id,           // use Supabase uuid as fileId
      sessionId: r.session_id,
      name: r.name,
      description: r.description,
      fileType: r.file_type,
      mimeType: r.mime_type,
      fileSize: r.file_size,
      status: 'approved',
      storagePath: r.storage_path,
      content: (r.file_type === 'html' || r.file_type === 'markdown' || r.file_type === 'text' || r.file_type === 'code') ? (r.content || null) : null,
      createdAt: r.created_at,
      slug: r.slug || null,
      published: r.published || false,
      bloomshieldRegistered: r.bloomshield_registered,
      downloadUrl: `/api/files/download/${r.id}`,
      previewUrl: r.storage_path || `/api/files/preview/${r.id}`,
      publishUrl: r.slug ? `/p/${r.slug}` : null
    }));

    return res.json({ artifacts, total: artifacts.length });
  } catch (error) {
    logger.error('List artifacts error', { error: error.message });
    return res.status(500).json({ error: 'Failed to list artifacts' });
  }
});

// ── PREVIEW FILE ─────────────────────────────────────────────────────────────
router.get('/preview/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const supabase = sb();
    const { data: file, error } = await supabase.from('artifacts')
      .select('name, file_type, mime_type, content, storage_path, slug, published')
      .eq('id', fileId)
      .single();

    if (error || !file) return res.status(404).json({ error: 'File not found' });

    // Images — redirect to Supabase CDN if available
    if (file.file_type === 'image') {
      if (file.storage_path) return res.redirect(302, file.storage_path);
      return res.status(404).json({ error: 'Image not available' });
    }

    // Text content — return as JSON for the editor/viewer
    if (file.content) {
      return res.json({
        name: file.name, fileType: file.file_type, mimeType: file.mime_type,
        content: file.content, slug: file.slug || null, published: file.published || false
      });
    }

    // Binary with storage_path — redirect
    if (file.storage_path) return res.redirect(302, file.storage_path);

    return res.json({ name: file.name, fileType: file.file_type, mimeType: file.mime_type, preview: 'binary' });
  } catch (error) {
    logger.error('Preview error', { error: error.message });
    return res.status(500).json({ error: 'Preview failed' });
  }
});

// ── DOWNLOAD FILE ─────────────────────────────────────────────────────────────
router.get('/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const supabase = sb();
    const { data: file, error } = await supabase.from('artifacts')
      .select('name, file_type, mime_type, content, storage_path')
      .eq('id', fileId)
      .single();

    if (error || !file) return res.status(404).json({ error: 'File not found' });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Binary stored in Supabase Storage — redirect to CDN for download
    if (file.storage_path && file.file_type === 'image') {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      return res.redirect(302, file.storage_path);
    }

    // Text content — send directly
    if (file.content) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Type', file.mime_type || 'text/plain');
      return res.send(file.content);
    }

    return res.status(404).json({ error: 'File content not available' });
  } catch (error) {
    logger.error('Download error', { error: error.message });
    return res.status(500).json({ error: 'Download failed' });
  }
});

// ── FULL-SCREEN PUBLISH PREVIEW ───────────────────────────────────────────────
router.get('/publish/:fileId', async (req, res) => {
  try {
    const supabase = sb();
    const { data: file, error } = await supabase.from('artifacts')
      .select('name, file_type, content, storage_path, session_id')
      .eq('id', req.params.fileId)
      .single();

    if (error || !file) return res.status(404).send('File not found');

    if (file.file_type === 'html' && file.content) {
      let html = file.content;
      // Rewrite relative .html links to use site route (enables multi-page site navigation)
      if (file.session_id) {
        html = html.replace(
          /href="([a-zA-Z0-9][a-zA-Z0-9._-]*\.html)(#[^"]*)?\"/gi,
          (match, fname, hash) => `href="/api/files/site/${file.session_id}/${fname}${hash || ''}"`
        );
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(html);
    }
    if (file.storage_path) return res.redirect(302, file.storage_path);
    return res.redirect(`/api/files/download/${req.params.fileId}`);
  } catch { return res.status(500).send('Preview failed'); }
});

// ── MULTI-PAGE SITE ROUTE — serve pages by session + filename ─────────────────
// Enables multi-page sites: Sarah uses relative links (href="about.html") and
// this route resolves them within the same session context.
router.get('/site/:sessionId/:filename', async (req, res) => {
  try {
    const { sessionId, filename } = req.params;
    const supabase = sb();
    const { data: file, error } = await supabase.from('artifacts')
      .select('name, file_type, content, storage_path, session_id')
      .eq('session_id', sessionId)
      .eq('name', filename)
      .single();

    if (error || !file) {
      // Fallback: try case-insensitive or partial match
      const { data: files } = await supabase.from('artifacts')
        .select('name, file_type, content, storage_path, session_id')
        .eq('session_id', sessionId)
        .eq('file_type', 'html');
      const match = (files || []).find(f =>
        f.name.toLowerCase() === filename.toLowerCase() ||
        f.name.toLowerCase().replace(/\s+/g, '-') === filename.toLowerCase()
      );
      if (!match) return res.status(404).send(`Page "${filename}" not found in this site`);
      return serveSitePage(match, sessionId, res);
    }

    return serveSitePage(file, sessionId, res);
  } catch (e) {
    logger.error('Site route error', { error: e.message });
    return res.status(500).send('Failed to load page');
  }
});

// Helper: serve an HTML page with relative links rewritten to the site route
function serveSitePage(file, sessionId, res) {
  if (file.file_type === 'html' && file.content) {
    let html = file.content;
    // Rewrite relative .html links to use site route
    // Matches href="filename.html" or href="filename.html#anchor"
    // Does NOT touch: href="#anchor", href="https://...", href="/absolute/...", href="mailto:..."
    html = html.replace(
      /href="([a-zA-Z0-9][a-zA-Z0-9._-]*\.html)(#[^"]*)?\"/gi,
      (match, fname, hash) => `href="/api/files/site/${sessionId}/${fname}${hash || ''}"`
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
  if (file.storage_path) return res.redirect(302, file.storage_path);
  return res.status(404).send('Content not available');
}

// ── PATCH — approve/reject ────────────────────────────────────────────────────
router.patch('/artifacts/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'status must be approved or rejected' });
    const supabase = sb();
    const updates = { published: status === 'approved' };
    if (status === 'approved') updates.approved_at = new Date().toISOString();
    const { data, error } = await supabase.from('artifacts').update(updates).eq('id', fileId).select('id, name').single();
    if (error || !data) return res.status(404).json({ error: 'Artifact not found' });
    return res.json({ success: true, artifact: data });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update artifact: ' + error.message });
  }
});

// ── PUT — edit content ────────────────────────────────────────────────────────
router.put('/artifacts/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { content, name } = req.body;
    if (!content && !name) return res.status(400).json({ error: 'content or name required' });
    const supabase = sb();
    const updates = {};
    if (content !== undefined) { updates.content = content; updates.file_size = Buffer.byteLength(content, 'utf8'); }
    if (name) updates.name = name;
    const { data, error } = await supabase.from('artifacts').update(updates).eq('id', fileId).select('id, name, file_size').single();
    if (error || !data) return res.status(404).json({ error: 'Artifact not found' });
    logger.info('Artifact content updated', { fileId, name: data.name });
    return res.json({ success: true, artifact: data });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update: ' + error.message });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────────
router.delete('/artifacts/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const supabase = sb();
    const { error } = await supabase.from('artifacts').delete().eq('id', fileId);
    if (error) return res.status(404).json({ error: 'Artifact not found' });
    return res.json({ success: true, deleted: fileId });
  } catch (error) {
    logger.error('Delete artifact error', { error: error.message });
    return res.status(500).json({ error: 'Delete failed' });
  }
});

// ── PUBLISH WITH SLUG ─────────────────────────────────────────────────────────
router.post('/artifacts/:fileId/publish', async (req, res) => {
  try {
    const { fileId } = req.params;
    let { slug } = req.body;
    if (!slug) return res.status(400).json({ error: 'slug is required' });
    slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
    if (!slug) return res.status(400).json({ error: 'Invalid slug' });
    const supabase = sb();
    // Check uniqueness
    const { data: existing } = await supabase.from('artifacts').select('id').eq('slug', slug).neq('id', fileId).maybeSingle();
    if (existing) return res.status(409).json({ error: `Slug "${slug}" is already taken`, taken: true });
    const { data, error } = await supabase.from('artifacts').update({ slug, published: true }).eq('id', fileId).select('id, name, slug').single();
    if (error || !data) return res.status(404).json({ error: 'Artifact not found' });
    logger.info('Artifact published', { fileId, slug });
    return res.json({ success: true, slug, url: `/p/${slug}`, artifact: data });
  } catch (error) {
    return res.status(500).json({ error: 'Publish failed: ' + error.message });
  }
});

router.post('/artifacts/:fileId/unpublish', async (req, res) => {
  try {
    const supabase = sb();
    const { error } = await supabase.from('artifacts').update({ published: false }).eq('id', req.params.fileId);
    if (error) return res.status(404).json({ error: 'Artifact not found' });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ── PARSE HTML for structured editor — extract text blocks, images, colors ──
router.get('/artifacts/:fileId/parse-editable', async (req, res) => {
  try {
    const supabase = sb();
    const { data: art } = await supabase.from('artifacts').select('id, name, content').eq('id', req.params.fileId).single();
    if (!art?.content) return res.status(404).json({ error: 'Artifact not found or has no content' });

    const html = art.content;
    const regions = [];

    // Helper: extract inline style property
    const getStyleProp = (tag, prop) => {
      const m = tag.match(new RegExp(prop + '[\\s]*:[\\s]*([^;}"\'`]+)', 'i'));
      return m ? m[1].trim() : null;
    };

    // Extract text regions WITH their computed styles
    const textPatterns = [
      { type: 'h1', regex: /<h1([^>]*)>([^<]{3,200})<\/h1>/gi },
      { type: 'h2', regex: /<h2([^>]*)>([^<]{3,200})<\/h2>/gi },
      { type: 'h3', regex: /<h3([^>]*)>([^<]{3,200})<\/h3>/gi },
      { type: 'p',  regex: /<p([^>]*)>([^<]{3,400})<\/p>/gi },
      { type: 'button', regex: /<button([^>]*)>([^<]{2,100})<\/button>/gi },
      { type: 'a', regex: /<a([^>]*)>([^<]{2,100})<\/a>/gi },
    ];

    for (const { type, regex } of textPatterns) {
      let m;
      regex.lastIndex = 0;
      while ((m = regex.exec(html)) !== null) {
        const attrs = m[1] || '';
        const text = m[2].trim();
        if (text && !text.includes('{') && !text.includes('null') && !text.includes('<')) {
          const color = getStyleProp(attrs, 'color');
          const bg = getStyleProp(attrs, 'background(?:-color)?');
          const fontSize = getStyleProp(attrs, 'font-size');
          const fontFamily = getStyleProp(attrs, 'font-family');
          const fontWeight = getStyleProp(attrs, 'font-weight');
          const textAlign = getStyleProp(attrs, 'text-align');
          const padding = getStyleProp(attrs, 'padding(?!-[a-z])');
          const margin = getStyleProp(attrs, 'margin(?!-[a-z])');
          const borderRadius = getStyleProp(attrs, 'border-radius');
          regions.push({
            type: 'text', tag: type, original: m[0], text, index: m.index,
            styles: { color, background: bg, fontSize, fontFamily, fontWeight, textAlign, padding, margin, borderRadius }
          });
        }
      }
    }

    // Extract images
    const imgRegex = /<img([^>]+)>/gi;
    let im;
    while ((im = imgRegex.exec(html)) !== null) {
      const attrs = im[1];
      const srcM = attrs.match(/src=["']([^"']+)["']/i);
      const altM = attrs.match(/alt=["']([^"']*)["']/i);
      const src = srcM ? srcM[1] : null;
      if (src && !src.includes('data:') && src.length < 500) {
        const width = getStyleProp(attrs, 'width') || (attrs.match(/width=["']?([\d%]+)/i) || [])[1];
        const height = getStyleProp(attrs, 'height') || (attrs.match(/height=["']?([\d%]+)/i) || [])[1];
        const borderRadius = getStyleProp(attrs, 'border-radius');
        regions.push({ type: 'image', original: im[0], src, alt: altM ? altM[1] : '', index: im.index, styles: { width, height, borderRadius } });
      }
    }

    // Extract ALL colors from HTML (CSS vars, inline styles, hex values)
    const colors = [];
    const colorRegex = /(?:background(?:-color)?|color|--[a-z-]+)\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g;
    let cm;
    while ((cm = colorRegex.exec(html)) !== null) {
      const val = cm[1];
      if (!colors.find(c => c.value === val)) {
        const prop = cm[0].split(':')[0].trim();
        colors.push({ property: prop, value: val });
      }
    }

    // Extract font families used in the page
    const fonts = [];
    const fontRegex = /font-family\s*:\s*([^;}"']+)/gi;
    let fm;
    while ((fm = fontRegex.exec(html)) !== null) {
      const fam = fm[1].trim().replace(/['"]/g, '').split(',')[0].trim();
      if (fam && !fonts.includes(fam) && fam.length < 60) fonts.push(fam);
    }

    // Sort by position in document
    regions.sort((a, b) => a.index - b.index);

    return res.json({ success: true, artifactId: art.id, name: art.name, regions: regions.slice(0, 50), colors: colors.slice(0, 20), fonts });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── SAVE raw HTML content directly (visual editor) ──
router.post('/artifacts/:fileId/apply-raw', async (req, res) => {
  try {
    const { content: newContent } = req.body;
    if (!newContent) return res.status(400).json({ error: 'content required' });
    const supabase = sb();
    const { error } = await supabase.from('artifacts')
      .update({ content: newContent, file_size: Buffer.byteLength(newContent, 'utf8'), updated_at: new Date().toISOString() })
      .eq('id', req.params.fileId);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── APPLY structured edits to HTML artifact ──
router.post('/artifacts/:fileId/apply-edits', async (req, res) => {
  try {
    const { edits } = req.body; // [{original, replacement}]
    if (!Array.isArray(edits) || !edits.length) return res.status(400).json({ error: 'edits array required' });
    const supabase = sb();
    const { data: art } = await supabase.from('artifacts').select('id, content').eq('id', req.params.fileId).single();
    if (!art?.content) return res.status(404).json({ error: 'Artifact not found' });
    let updated = art.content;
    let applied = 0;
    for (const { original, replacement } of edits) {
      if (original && replacement !== undefined && updated.includes(original)) {
        updated = updated.split(original).join(replacement);
        applied++;
      }
    }
    if (applied === 0) return res.status(400).json({ error: 'No edits matched — content may have changed' });
    const { error } = await supabase.from('artifacts').update({ content: updated, updated_at: new Date().toISOString() }).eq('id', art.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, applied });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


// ── GET all AI-generated images — for GrapesJS Asset Manager ──
// Returns GrapesJS-compatible asset array: { assets: [{src, name, type, category}] }
router.get('/images', async (req, res) => {
  try {
    const { limit = 200, search } = req.query;
    const supabase = sb();

    let query = supabase
      .from('artifacts')
      .select('id, name, description, storage_path, created_at')
      .eq('file_type', 'image')
      .not('storage_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    const { data, error } = await query;
    if (error) throw error;

    const assets = (data || [])
      .filter(r => r.storage_path && r.storage_path.startsWith('http'))
      .filter(r => !search || (r.description || r.name || '').toLowerCase().includes(search.toLowerCase()))
      .map(r => ({
        id:          r.id,
        src:         r.storage_path,
        name:        r.name || 'Generated image',
        description: r.description || '',
        type:        'image',
        category:    'AI Generated',
        created_at:  r.created_at,
      }));

    return res.json({ success: true, assets, total: assets.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── SWAP an image URL inside an HTML artifact ──
// Replaces oldSrc with newSrc everywhere it appears in the artifact HTML
router.post('/artifacts/:fileId/swap-image', async (req, res) => {
  try {
    const { oldSrc, newSrc } = req.body;
    if (!oldSrc || !newSrc) return res.status(400).json({ error: 'oldSrc and newSrc required' });

    const supabase = sb();
    const { data: art } = await supabase
      .from('artifacts')
      .select('id, content')
      .eq('id', req.params.fileId)
      .single();

    if (!art?.content) return res.status(404).json({ error: 'Artifact not found' });

    const occurrences = (art.content.match(new RegExp(escapeRegex(oldSrc), 'g')) || []).length;
    if (occurrences === 0) return res.status(400).json({ error: `Image URL not found in artifact: ${oldSrc.substring(0, 80)}` });

    const updated = art.content.split(oldSrc).join(newSrc);

    const { error } = await supabase
      .from('artifacts')
      .update({ content: updated, updated_at: new Date().toISOString() })
      .eq('id', art.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true, replaced: occurrences, artifactId: art.id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default router;
