// BLOOM Files API — artifact storage, file serving, and deliverables library
// Source of truth: Supabase artifacts table + Supabase Storage (bloom-artifacts bucket)
// Railway disk used only as write-through cache for content_text and binary files

import { Router } from 'express';
import { createLogger } from '../logging/logger.js';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import { validateAgentAccess, getAgentOrgId, getUserOrgId, extractUserId } from './org-boundary.js';

const logger = createLogger('files-api');
const router = Router();

const FILE_STORAGE = process.env.FILE_STORAGE_PATH || path.join(process.cwd(), 'bloom-files');
if (!fs.existsSync(FILE_STORAGE)) fs.mkdirSync(FILE_STORAGE, { recursive: true });

const ORG_ID    = () => process.env.BLOOM_ORG_ID        || 'a1000000-0000-0000-0000-000000000001';
const USER_ID   = () => process.env.BLOOM_OWNER_USER_ID || '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';
const AGENT_ID  = () => process.env.AGENT_UUID          || 'c3000000-0000-0000-0000-000000000003';
const DEFAULT_ORG_ID = 'a1000000-0000-0000-0000-000000000001';

function sb() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function isPublicUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function normalizeBaseUrl(url) {
  if (!url) return null;
  const normalized = url.startsWith('http') ? url : `https://${url}`;
  return normalized.replace(/\/+$/, '');
}

function googleDriveReconnectUrl(orgId) {
  const baseUrl = normalizeBaseUrl(
    process.env.GOOGLE_OAUTH_REDIRECT_BASE_URL ||
    process.env.OAUTH_BASE_URL ||
    process.env.BLOOM_API_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN
  ) || 'https://autonomous-sarah-rodriguez-production.up.railway.app';
  const params = new URLSearchParams({ orgId: orgId || DEFAULT_ORG_ID });
  return `${baseUrl}/oauth/connect/google-drive?${params.toString()}`;
}

function isBinaryArtifact(fileType, mimeType = '') {
  const ft = String(fileType || '').toLowerCase();
  const mt = String(mimeType || '').toLowerCase();
  return ['binary', 'document', 'pdf', 'docx', 'pptx', 'xlsx', 'zip'].includes(ft)
    || mt.includes('pdf')
    || mt.includes('officedocument')
    || mt.includes('application/zip')
    || mt.includes('octet-stream');
}

function binaryExt(name = '', fileType = '', mimeType = '') {
  const lowerName = String(name || '').toLowerCase();
  const fromName = lowerName.match(/(\.[a-z0-9]+)$/)?.[1];
  if (fromName) return fromName;
  const ft = String(fileType || '').toLowerCase();
  const mt = String(mimeType || '').toLowerCase();
  if (ft === 'pdf' || mt.includes('pdf')) return '.pdf';
  if (ft === 'docx' || mt.includes('wordprocessingml')) return '.docx';
  if (ft === 'pptx' || mt.includes('presentationml')) return '.pptx';
  if (ft === 'xlsx' || mt.includes('spreadsheetml')) return '.xlsx';
  if (ft === 'zip' || mt.includes('zip')) return '.zip';
  return '.bin';
}

function artifactExt(name = '') {
  return String(name || '').split('.').pop()?.toLowerCase() || '';
}

function googleImportTarget(name = '', fileType = '', mimeType = '') {
  const ext = artifactExt(name);
  const ft = String(fileType || '').toLowerCase();
  const mt = String(mimeType || '').toLowerCase();
  if (ext === 'docx' || ft === 'docx' || mt.includes('wordprocessingml')) {
    return {
      sourceMime: mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      targetMime: 'application/vnd.google-apps.document',
      label: 'Google Docs'
    };
  }
  if (ext === 'xlsx' || ft === 'xlsx' || mt.includes('spreadsheetml')) {
    return {
      sourceMime: mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      targetMime: 'application/vnd.google-apps.spreadsheet',
      label: 'Google Sheets'
    };
  }
  if (ext === 'csv' || ft === 'csv' || mt.includes('text/csv')) {
    return {
      sourceMime: 'text/csv',
      targetMime: 'application/vnd.google-apps.spreadsheet',
      label: 'Google Sheets'
    };
  }
  if (ext === 'pptx' || ft === 'pptx' || mt.includes('presentationml')) {
    return {
      sourceMime: mimeType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      targetMime: 'application/vnd.google-apps.presentation',
      label: 'Google Slides'
    };
  }
  if (ext === 'pdf' || ft === 'pdf' || mt.includes('pdf')) {
    return { sourceMime: 'application/pdf', targetMime: null, label: 'Google Drive' };
  }
  return null;
}

async function refreshGoogleAccessToken(refreshToken, supabase, userConnRow, orgId) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Google OAuth client is not configured');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    }).toString()
  });
  if (!response.ok) {
    const text = await response.text();
    if (text.includes('invalid_grant')) {
      const reconnectUrl = googleDriveReconnectUrl(orgId);
      const message = `Google rejected the stored Google Drive refresh token with invalid_grant. Reconnect Google Drive here: ${reconnectUrl}`;
      await supabase.from('user_connectors').update({
        last_error: message,
        updated_at: new Date().toISOString()
      }).eq('id', userConnRow.id).eq('organization_id', orgId);
      const err = new Error(message);
      err.code = 'GOOGLE_DRIVE_RECONNECT_REQUIRED';
      err.reconnectUrl = reconnectUrl;
      throw err;
    }
    throw new Error(`Google token refresh failed: ${response.status} ${text}`);
  }
  const tokenData = await response.json();
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;
  await supabase.from('user_connectors').update({
    access_token: tokenData.access_token,
    token_expires_at: expiresAt,
    last_error: null,
    updated_at: new Date().toISOString()
  }).eq('id', userConnRow.id).eq('organization_id', orgId);
  return tokenData.access_token;
}

async function getGoogleDriveAccessToken(supabase, orgId) {
  const { data: connector, error: connectorErr } = await supabase
    .from('connectors')
    .select('id')
    .eq('slug', 'google-drive')
    .maybeSingle();
  if (connectorErr) throw connectorErr;
  if (!connector?.id) throw new Error('Google Drive connector is not installed');

  const { data: userConn, error: userConnErr } = await supabase
    .from('user_connectors')
    .select('id, access_token, refresh_token, token_expires_at, status, connected_by')
    .eq('connector_id', connector.id)
    .eq('organization_id', orgId)
    .eq('status', 'active')
    .maybeSingle();
  if (userConnErr) throw userConnErr;
  if (!userConn?.access_token) throw new Error('Google Drive is not connected for this organization');
  if (!userConn.refresh_token && userConn.token_expires_at && new Date(userConn.token_expires_at).getTime() <= Date.now()) {
    const reconnectUrl = googleDriveReconnectUrl(orgId);
    const message = `Google Drive token expired and no refresh token is available. Reconnect Google Drive here: ${reconnectUrl}`;
    await supabase.from('user_connectors').update({
      last_error: message,
      updated_at: new Date().toISOString()
    }).eq('id', userConn.id).eq('organization_id', orgId);
    const err = new Error(message);
    err.code = 'GOOGLE_DRIVE_RECONNECT_REQUIRED';
    err.reconnectUrl = reconnectUrl;
    throw err;
  }

  if (userConn.token_expires_at && userConn.refresh_token) {
    const expiresAt = new Date(userConn.token_expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt - Date.now() < 5 * 60 * 1000) {
      return refreshGoogleAccessToken(userConn.refresh_token, supabase, userConn, orgId);
    }
  }

  return userConn.access_token;
}

async function artifactBuffer(file) {
  if (file.storage_path && isPublicUrl(file.storage_path)) {
    const response = await fetch(file.storage_path);
    if (!response.ok) throw new Error(`Unable to fetch artifact from storage: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  if (file.storage_path && !isPublicUrl(file.storage_path) && fs.existsSync(file.storage_path)) {
    return fs.readFileSync(file.storage_path);
  }
  if (file.content) {
    if (isBinaryArtifact(file.file_type, file.mime_type)) return Buffer.from(file.content, 'base64');
    return Buffer.from(file.content, 'utf8');
  }
  throw new Error('File content is not available');
}

function formatSheetCell(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (value.result != null) return formatSheetCell(value.result);
    if (value.formula) return `=${value.formula}`;
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (value.hyperlink && value.text) return String(value.text);
    return String(value);
  }
  return String(value);
}

function csvRows(content = '', maxRows = 20, maxCols = 12) {
  return String(content || '')
    .split(/\r?\n/)
    .filter((line, index) => index === 0 || line.trim())
    .slice(0, maxRows)
    .map(line => {
      const cells = [];
      let current = '';
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        const next = line[i + 1];
        if (ch === '"' && quoted && next === '"') {
          current += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = !quoted;
        } else if (ch === ',' && !quoted) {
          cells.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      cells.push(current);
      return cells.slice(0, maxCols);
    });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(value = '', patterns = []) {
  for (const pattern of patterns) {
    const match = String(value || '').match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function blogCategoryFor(content = '') {
  const lower = String(content || '').toLowerCase();
  if (/\b(advisor|financial|ria|aum|fiduciary|client review|custodian)\b/.test(lower)) {
    return { label: 'Financial Advisors', tag: 'FINANCIAL ADVISORS', author: 'Marcus Chen' };
  }
  if (/\b(real estate|realtor|listing|buyer lead|seller lead|brokerage)\b/.test(lower)) {
    return { label: 'Real Estate', tag: 'REAL ESTATE', author: 'Sarah Rodriguez' };
  }
  if (/\b(e-commerce|ecommerce|shopify|online store|cart|inventory)\b/.test(lower)) {
    return { label: 'E-commerce', tag: 'E-COMMERCE', author: 'Sarah Rodriguez' };
  }
  return { label: 'AI Staffing', tag: 'AI STAFFING', author: 'Sarah Rodriguez' };
}

function buildBlogIndexCard(artifact) {
  const html = String(artifact.content || '');
  const title = stripHtml(firstMatch(html, [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i
  ])) || String(artifact.name || '').replace(/\.html?$/i, '');
  const description = stripHtml(firstMatch(html, [
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
    /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i,
    /<p[^>]*>([\s\S]*?)<\/p>/i
  ])).slice(0, 180) || 'See how Bloomie Staffing turns repetitive operational work into a reliable AI employee workflow.';
  const image = firstMatch(html, [
    /<img[^>]+class=["'][^"']*hero-image[^"']*["'][^>]+src=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*hero-image[^"']*["']/i,
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
    /<img[^>]+src=["']([^"']+)["']/i
  ]);
  const category = blogCategoryFor(`${title}\n${description}\n${html}`);
  const date = new Date(artifact.created_at || Date.now()).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Chicago'
  });

  return `
    <a href="/p/${escapeHtml(artifact.slug)}" class="blog-card">
      <img src="${escapeHtml(image)}" alt="${escapeHtml(title)} preview">
      <div class="blog-card-content blog-card-body">
        <div class="meta">${escapeHtml(category.author)} · ${escapeHtml(category.label)} · ${escapeHtml(date)}</div>
        <span class="blog-tag">${escapeHtml(category.tag)}</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
        <span class="read-more">Read Article &rarr;</span>
      </div>
    </a>
`;
}

async function refreshBlogIndexAfterPublish(supabase, artifact) {
  if (!artifact?.slug || artifact.slug === 'blog' || !artifact.slug.startsWith('blog-')) {
    return { updated: false, skipped: true, reason: 'not_blog_post' };
  }
  if (!String(artifact.file_type || '').toLowerCase().includes('html')) {
    return { updated: false, skipped: true, reason: 'not_html' };
  }

  const { data: index, error: indexError } = await supabase
    .from('artifacts')
    .select('id, content')
    .eq('slug', 'blog')
    .maybeSingle();
  if (indexError) throw indexError;
  if (!index?.id || !index.content) throw new Error('Blog index artifact slug=blog was not found');

  const href = `/p/${artifact.slug}`;
  if (index.content.includes(`href="${href}"`) || index.content.includes(`href='${href}'`)) {
    return { updated: false, skipped: true, reason: 'already_present', artifactId: index.id };
  }
  if (!index.content.includes('<div class="blog-grid">')) {
    throw new Error('Blog index is missing <div class="blog-grid"> marker');
  }

  const nextContent = index.content.replace(
    '<div class="blog-grid">',
    `<div class="blog-grid">\n${buildBlogIndexCard(artifact)}`
  );
  const { error: updateError } = await supabase
    .from('artifacts')
    .update({
      content: nextContent,
      file_size: Buffer.byteLength(nextContent, 'utf8'),
      updated_at: new Date().toISOString()
    })
    .eq('id', index.id);
  if (updateError) throw updateError;
  return { updated: true, artifactId: index.id };
}

// ── CREATE ARTIFACT ──────────────────────────────────────────────────────────
router.post('/artifacts', async (req, res) => {
  try {
    const { name, description = '', fileType = 'text', mimeType = 'text/plain', content, sessionId = null, agentId = null, metadata = {} } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content required' });

    // ── Org-boundary: if agentId provided, verify ownership ──
    // create_artifact calls this route internally from the same service without
    // a user JWT. In that path, require organizationId and verify the agent
    // belongs to that org instead of returning a false auth failure.
    if (agentId) {
      const userId = extractUserId(req);
      if (!userId && req.body.organizationId) {
        const agentOrgId = await getAgentOrgId(agentId);
        if (!agentOrgId) return res.status(404).json({ error: 'Agent not found' });
        if (agentOrgId !== req.body.organizationId) {
          return res.status(403).json({ error: 'Access denied — agent belongs to a different organization' });
        }
      } else {
        const access = await validateAgentAccess(req, agentId);
        if (!access.authorized) return res.status(access.status).json({ error: access.error });
      }
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

    } else if (isBinaryArtifact(fileType, mimeType)) {
      const buffer = Buffer.from(content, 'base64');
      const ext = binaryExt(name, fileType, mimeType);
      filePath = path.join(FILE_STORAGE, `${fileId}${ext}`);
      fs.writeFileSync(filePath, buffer);
      fileSize = buffer.length;

      // Upload binary deliverables so the app can preview/embed them by URL.
      try {
        const supabase = sb();
        const storageKey = `artifacts/${fileId}${ext}`;
        const { error: upErr } = await supabase.storage.from('bloom-artifacts').upload(storageKey, buffer, { contentType: mimeType, upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('bloom-artifacts').getPublicUrl(storageKey);
          storagePath = urlData?.publicUrl || null;
        } else {
          logger.warn('Supabase binary artifact upload failed', { error: upErr.message, name });
        }
      } catch (e) { logger.warn('Supabase binary artifact upload failed', { error: e.message, name }); }

      // Railway's local disk is not durable across deploys. If Storage upload is
      // unavailable, retain the base64 payload in Supabase so downloads/previews survive.
      if (!storagePath) contentText = content;
    } else {
      contentText = content;
      fileSize = Buffer.byteLength(content, 'utf8');
      const ext = fileType === 'html' ? '.html'
        : fileType === 'code' ? '.js'
        : fileType === 'csv' ? '.csv'
        : fileType === 'text' ? '.txt'
        : '.md';
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
        fileId: artifact.id,
        localFileId: fileId,
        name,
        status: 'approved',
        createdAt: new Date().toISOString(),
        downloadUrl: `/api/files/download/${artifact.id}`,
        previewUrl: `/api/files/preview/${artifact.id}`,
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
      content: (r.file_type === 'html' || r.file_type === 'markdown' || r.file_type === 'text' || r.file_type === 'code' || r.file_type === 'csv') ? (r.content || null) : null,
      createdAt: r.created_at,
      approvedAt: r.created_at,  // alias for frontend date display/sorting
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

// ── OPEN IN GOOGLE DRIVE/DOCS/SHEETS/SLIDES ─────────────────────────────────
router.post('/google-import/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const supabase = sb();
    const { data: file, error } = await supabase.from('artifacts')
      .select('id, name, file_type, mime_type, content, storage_path, organization_id')
      .eq('id', fileId)
      .single();

    if (error || !file) return res.status(404).json({ error: 'File not found' });

    const resolvedOrgId = await getUserOrgId(req);
    if (!resolvedOrgId) return res.status(401).json({ error: 'Authentication required' });
    if (file.organization_id && file.organization_id !== resolvedOrgId) {
      return res.status(403).json({ error: 'Access denied — file belongs to a different organization' });
    }

    const target = googleImportTarget(file.name, file.file_type, file.mime_type);
    if (!target) {
      return res.status(400).json({ error: 'This file type cannot be opened in Google Drive from BLOOM yet.' });
    }

    const accessToken = await getGoogleDriveAccessToken(supabase, resolvedOrgId);
    const buffer = await artifactBuffer(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_');

    const metadata = {
      name: safeName,
      ...(target.targetMime ? { mimeType: target.targetMime } : {})
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([buffer], { type: target.sourceMime }), safeName);

    const uploadResp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });

    if (!uploadResp.ok) {
      const text = await uploadResp.text();
      logger.warn('Google Drive import failed', { fileId, status: uploadResp.status, error: text.slice(0, 500) });
      return res.status(uploadResp.status).json({ error: `Google Drive import failed: ${uploadResp.status} ${text}` });
    }

    const uploaded = await uploadResp.json();
    logger.info('Artifact imported to Google Drive', { fileId, googleFileId: uploaded.id, target: target.label });
    return res.json({
      success: true,
      target: target.label,
      file: uploaded,
      webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`
    });
  } catch (error) {
    logger.error('Google import error', { error: error.message });
    if (error.code === 'GOOGLE_DRIVE_RECONNECT_REQUIRED') {
      return res.status(401).json({
        error: 'Google Drive needs to be reconnected before opening files in Google Sheets.',
        reconnectUrl: error.reconnectUrl
      });
    }
    return res.status(500).json({ error: error.message || 'Google import failed' });
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

    // Binary with public storage URL — redirect so iframe/object viewers can load it.
    if (file.storage_path && isPublicUrl(file.storage_path)) return res.redirect(302, file.storage_path);

    return res.json({ name: file.name, fileType: file.file_type, mimeType: file.mime_type, preview: 'binary' });
  } catch (error) {
    logger.error('Preview error', { error: error.message });
    return res.status(500).json({ error: 'Preview failed' });
  }
});

// ── SPREADSHEET GRID PREVIEW ────────────────────────────────────────────────
router.get('/sheet-preview/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const maxRows = Math.min(Math.max(parseInt(req.query.rows, 10) || 20, 1), 50);
    const maxCols = Math.min(Math.max(parseInt(req.query.cols, 10) || 12, 1), 24);
    const supabase = sb();
    const { data: file, error } = await supabase.from('artifacts')
      .select('id, name, file_type, mime_type, content, storage_path')
      .eq('id', fileId)
      .single();

    if (error || !file) return res.status(404).json({ error: 'File not found' });

    const ext = artifactExt(file.name);
    const ft = String(file.file_type || '').toLowerCase();
    const mt = String(file.mime_type || '').toLowerCase();
    const isXlsx = ext === 'xlsx' || ft === 'xlsx' || mt.includes('spreadsheetml');
    const isCsv = ext === 'csv' || ft === 'csv' || mt.includes('text/csv');

    if (isCsv) {
      const buffer = await artifactBuffer(file);
      return res.json({
        name: file.name,
        type: 'csv',
        sheets: [{ name: 'Sheet1', rows: csvRows(buffer.toString('utf8'), maxRows, maxCols) }]
      });
    }

    if (!isXlsx) return res.status(400).json({ error: 'File is not a spreadsheet preview type' });

    const buffer = await artifactBuffer(file);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheets = workbook.worksheets.slice(0, 4).map((worksheet) => {
      const rows = [];
      const rowLimit = Math.min(worksheet.actualRowCount || worksheet.rowCount || maxRows, maxRows);
      const colLimit = Math.min(worksheet.actualColumnCount || worksheet.columnCount || maxCols, maxCols);
      for (let rowNumber = 1; rowNumber <= rowLimit; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values = [];
        for (let colNumber = 1; colNumber <= colLimit; colNumber += 1) {
          values.push(formatSheetCell(row.getCell(colNumber).value));
        }
        rows.push(values);
      }
      return { name: worksheet.name, rows };
    });

    return res.json({ name: file.name, type: 'xlsx', sheets });
  } catch (error) {
    logger.error('Sheet preview error', { fileId: req.params.fileId, error: error.message });
    return res.status(500).json({ error: error.message || 'Spreadsheet preview failed' });
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
    if (file.storage_path && isPublicUrl(file.storage_path)) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      return res.redirect(302, file.storage_path);
    }

    // Binary cached on local disk
    if (file.storage_path && !isPublicUrl(file.storage_path) && fs.existsSync(file.storage_path)) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      return res.sendFile(file.storage_path);
    }

    // Text content or legacy base64 binary content — send directly
    if (file.content) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Type', file.mime_type || 'text/plain');
      if (isBinaryArtifact(file.file_type, file.mime_type)) {
        return res.send(Buffer.from(file.content, 'base64'));
      }
      return res.send(file.content);
    }

    return res.status(404).json({ error: 'File content not available' });
  } catch (error) {
    logger.error('Download error', { error: error.message });
    return res.status(500).json({ error: 'Download failed' });
  }
});

// ── EMBED FILE INLINE ────────────────────────────────────────────────────────
router.get('/embed/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const supabase = sb();
    const { data: file, error } = await supabase.from('artifacts')
      .select('name, file_type, mime_type, content, storage_path')
      .eq('id', fileId)
      .single();

    if (error || !file) return res.status(404).send('File not found');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);

    if (file.storage_path && isPublicUrl(file.storage_path)) {
      return res.redirect(302, file.storage_path);
    }
    if (file.storage_path && !isPublicUrl(file.storage_path) && fs.existsSync(file.storage_path)) {
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      return res.sendFile(file.storage_path);
    }
    if (file.content) {
      res.setHeader('Content-Type', file.mime_type || 'text/plain');
      if (isBinaryArtifact(file.file_type, file.mime_type)) {
        return res.send(Buffer.from(file.content, 'base64'));
      }
      return res.send(file.content);
    }

    return res.status(404).send('File content not available');
  } catch (error) {
    logger.error('Embed error', { error: error.message });
    return res.status(500).send('Embed failed');
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
    const { data, error } = await supabase
      .from('artifacts')
      .update({ slug, published: true })
      .eq('id', fileId)
      .select('id, name, slug, file_type, content, description, created_at')
      .single();
    if (error || !data) return res.status(404).json({ error: 'Artifact not found' });
    let blogIndex = { updated: false, skipped: true, reason: 'not_attempted' };
    try {
      blogIndex = await refreshBlogIndexAfterPublish(supabase, data);
    } catch (indexError) {
      blogIndex = { updated: false, error: indexError.message };
      logger.warn('Blog index refresh failed after artifact publish', { fileId, slug, error: indexError.message });
    }
    logger.info('Artifact published', { fileId, slug });
    return res.json({ success: true, slug, url: `/p/${slug}`, artifact: data, blogIndex });
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
