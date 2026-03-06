// BLOOM Files API — artifact storage, file serving, and deliverables library
// Workflow: Sarah creates artifact → appears in chat → user approves → moves to Files tab

import { Router } from 'express';
import { createLogger } from '../logging/logger.js';
import pg from 'pg';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const logger = createLogger('files-api');
const router = Router();

// File storage — use Railway volume if available, fallback to app directory (survives within deploy)
const FILE_STORAGE = process.env.FILE_STORAGE_PATH || path.join(process.cwd(), 'bloom-files');
if (!fs.existsSync(FILE_STORAGE)) fs.mkdirSync(FILE_STORAGE, { recursive: true });

async function getPool() {
  const { getSharedPool } = await import('../database/pool.js');
  return getSharedPool();
}

// Auto-create artifacts table
async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id SERIAL PRIMARY KEY,
      file_id VARCHAR(64) UNIQUE NOT NULL,
      session_id VARCHAR(128),
      name VARCHAR(500) NOT NULL,
      description TEXT,
      file_type VARCHAR(50) NOT NULL,
      mime_type VARCHAR(128),
      content_text TEXT,
      file_path VARCHAR(500),
      file_size INTEGER DEFAULT 0,
      thumbnail_base64 TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      published BOOLEAN DEFAULT false,
      slug VARCHAR(200) UNIQUE,
      created_by VARCHAR(100) DEFAULT 'sarah',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
    CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_file_id ON artifacts(file_id);
  `);
  // Add columns if they don't exist (migration for existing tables)
  try { await pool.query(`ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS slug VARCHAR(200) UNIQUE`); } catch {}
  try { await pool.query(`ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS published BOOLEAN DEFAULT false`); } catch {}
  try { await pool.query(`CREATE INDEX IF NOT EXISTS idx_artifacts_slug ON artifacts(slug)`); } catch {}
}

// ── CREATE ARTIFACT ─────────────────────────────────────────────────────────
// Called by Sarah's tool execution when she creates content
// POST /api/files/artifacts
router.post('/artifacts', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const {
      name,
      description = '',
      fileType = 'text',    // text, html, image, document, code
      mimeType = 'text/plain',
      content,              // text content OR base64 data
      sessionId = null,
      metadata = {}
    } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'name and content required' });
    }

    const fileId = `art_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let filePath = null;
    let fileSize = 0;
    let thumbnailBase64 = null;
    let contentText = null;

    // Handle different content types
    if (fileType === 'image') {
      // Save base64 image to disk
      const buffer = Buffer.from(content, 'base64');
      const ext = mimeType.includes('png') ? '.png' : mimeType.includes('gif') ? '.gif' : '.jpg';
      filePath = path.join(FILE_STORAGE, `${fileId}${ext}`);
      fs.writeFileSync(filePath, buffer);
      fileSize = buffer.length;
      // Use a smaller version as thumbnail (or just the first 50KB)
      thumbnailBase64 = buffer.length > 50000 ? content.substring(0, 66666) : content;
    } else if (fileType === 'document' || fileType === 'pdf') {
      // Binary file — save to disk
      const buffer = Buffer.from(content, 'base64');
      const ext = mimeType.includes('pdf') ? '.pdf' : mimeType.includes('word') ? '.docx' : '.bin';
      filePath = path.join(FILE_STORAGE, `${fileId}${ext}`);
      fs.writeFileSync(filePath, buffer);
      fileSize = buffer.length;
    } else {
      // Text-based content (text, html, code, markdown)
      contentText = content;
      fileSize = Buffer.byteLength(content, 'utf8');
      // Also save to disk for download
      const ext = fileType === 'html' ? '.html' : fileType === 'code' ? '.js' : '.md';
      filePath = path.join(FILE_STORAGE, `${fileId}${ext}`);
      fs.writeFileSync(filePath, content, 'utf8');
    }

    const result = await pool.query(`
      INSERT INTO artifacts (file_id, session_id, name, description, file_type, mime_type, content_text, file_path, file_size, thumbnail_base64, status, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'approved', $11)
      RETURNING id, file_id, name, status, created_at
    `, [fileId, sessionId, name, description, fileType, mimeType, contentText, filePath, fileSize, thumbnailBase64, JSON.stringify(metadata)]);

    const artifact = result.rows[0];
    logger.info('Artifact created', { fileId, name, fileType, fileSize });

    return res.json({
      success: true,
      artifact: {
        id: artifact.id,
        fileId: artifact.file_id,
        name: artifact.name,
        status: artifact.status,
        createdAt: artifact.created_at,
        downloadUrl: `/api/files/download/${artifact.file_id}`,
        previewUrl: `/api/files/preview/${artifact.file_id}`
      }
    });
  } catch (error) {
    logger.error('Create artifact error', { error: error.message });
    return res.status(500).json({ error: 'Failed to create artifact' });
  }
});

// ── LIST ARTIFACTS ──────────────────────────────────────────────────────────
// GET /api/files/artifacts?status=approved&limit=50
router.get('/artifacts', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const { status, limit = 50, sessionId } = req.query;
    let query = 'SELECT id, file_id, session_id, name, description, file_type, mime_type, file_size, status, created_by, created_at, approved_at, metadata, slug, published FROM artifacts';
    const conditions = [];
    const params = [];

    if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }
    if (sessionId) { conditions.push(`session_id = $${params.length + 1}`); params.push(sessionId); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    const artifacts = result.rows.map(r => ({
      id: r.id,
      fileId: r.file_id,
      sessionId: r.session_id,
      name: r.name,
      description: r.description,
      fileType: r.file_type,
      mimeType: r.mime_type,
      fileSize: r.file_size,
      status: r.status,
      createdBy: r.created_by,
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      metadata: r.metadata,
      slug: r.slug || null,
      published: r.published || false,
      downloadUrl: `/api/files/download/${r.file_id}`,
      previewUrl: `/api/files/preview/${r.file_id}`,
      publishUrl: r.slug ? `/p/${r.slug}` : null
    }));

    return res.json({ artifacts, total: artifacts.length });
  } catch (error) {
    logger.error('List artifacts error', { error: error.message });
    return res.status(500).json({ error: 'Failed to list artifacts' });
  }
});

// ── APPROVE / REJECT ARTIFACT ───────────────────────────────────────────────
// PATCH /api/files/artifacts/:fileId — status changes (approve/reject)
router.patch('/artifacts/:fileId', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    await ensureTable(pool);
    const { fileId } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }

    const result = await pool.query(
      `UPDATE artifacts SET status = $1 WHERE file_id = $2 RETURNING id, file_id, name, status`,
      [status, fileId]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Artifact not found' });

    if (status === 'approved') {
      await pool.query(`UPDATE artifacts SET approved_at = NOW() WHERE file_id = $1`, [fileId]);
    }

    return res.json({ success: true, artifact: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update artifact: ' + error.message });
  }
});

// PUT /api/files/artifacts/:fileId — update file content (edit mode)
router.put('/artifacts/:fileId', async (req, res) => {
  try {
    const pool = await getPool();
    await ensureTable(pool);
    const { fileId } = req.params;
    const { content, name } = req.body;

    if (!content && !name) return res.status(400).json({ error: 'content or name required' });

    const updates = [];
    const params = [];
    if (content !== undefined) {
      updates.push(`content_text = $${params.length + 1}`);
      params.push(content);
      updates.push(`file_size = $${params.length + 1}`);
      params.push(Buffer.byteLength(content, 'utf8'));
    }
    if (name) {
      updates.push(`name = $${params.length + 1}`);
      params.push(name);
    }
    params.push(fileId);

    const result = await pool.query(
      `UPDATE artifacts SET ${updates.join(', ')} WHERE file_id = $${params.length} RETURNING file_id, name, file_size`,
      params
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Artifact not found' });

    // Also update the file on disk if it exists
    try {
      const pathRes = await pool.query('SELECT file_path FROM artifacts WHERE file_id = $1', [fileId]);
      if (pathRes.rows[0]?.file_path && content) {
        fs.writeFileSync(pathRes.rows[0].file_path, content, 'utf8');
      }
    } catch {}

    logger.info('Artifact content updated', { fileId, name: result.rows[0].name });
    return res.json({ success: true, artifact: result.rows[0] });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update: ' + error.message });
  }
});

// ── DOWNLOAD FILE ───────────────────────────────────────────────────────────
// GET /api/files/download/:fileId
router.get('/download/:fileId', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const { fileId } = req.params;
    const result = await pool.query(
      'SELECT name, file_type, mime_type, content_text, file_path FROM artifacts WHERE file_id = $1', [fileId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');

    if (file.file_path && fs.existsSync(file.file_path)) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      return fs.createReadStream(file.file_path).pipe(res);
    }

    if (file.content_text) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.setHeader('Content-Type', file.mime_type || 'text/plain');
      return res.send(file.content_text);
    }

    return res.status(404).json({ error: 'File content not available' });
  } catch (error) {
    logger.error('Download error', { error: error.message });
    return res.status(500).json({ error: 'Download failed' });
  }
});

// ── PREVIEW FILE ────────────────────────────────────────────────────────────
// GET /api/files/preview/:fileId
router.get('/preview/:fileId', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const { fileId } = req.params;
    const result = await pool.query(
      'SELECT name, file_type, mime_type, content_text, thumbnail_base64, file_path, slug, published FROM artifacts WHERE file_id = $1', [fileId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];

    // For images — serve from filesystem if available
    if (file.file_type === 'image' && file.file_path && fs.existsSync(file.file_path)) {
      res.setHeader('Content-Type', file.mime_type || 'image/png');
      return fs.createReadStream(file.file_path).pipe(res);
    }

    // For images — serve from base64 if stored in content_text
    if (file.file_type === 'image' && file.content_text) {
      const base64Data = file.content_text.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      res.setHeader('Content-Type', file.mime_type || 'image/png');
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    }

    // For text content — return as JSON for rendering
    if (file.content_text) {
      return res.json({
        name: file.name,
        fileType: file.file_type,
        mimeType: file.mime_type,
        content: file.content_text,
        slug: file.slug || null,
        published: file.published || false
      });
    }

    // For binary files — return metadata only
    return res.json({ name: file.name, fileType: file.file_type, mimeType: file.mime_type, preview: 'binary' });
  } catch (error) {
    logger.error('Preview error', { error: error.message });
    return res.status(500).json({ error: 'Preview failed' });
  }
});

// ── FULL-SCREEN PUBLISH PREVIEW ─────────────────────────────────────────────
// GET /api/files/publish/:fileId — serves HTML directly for full-screen viewing
router.get('/publish/:fileId', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const result = await pool.query(
      'SELECT name, file_type, content_text, file_path FROM artifacts WHERE file_id = $1', [req.params.fileId]
    );
    if (!result.rows.length) return res.status(404).send('File not found');
    const file = result.rows[0];

    if (file.file_type === 'html' && file.content_text) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(file.content_text);
    }
    if (file.file_type === 'markdown' && file.content_text) {
      const md = file.content_text
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '<br/><br/>')
        .replace(/\n/g, '<br/>');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${file.name}</title><style>body{max-width:800px;margin:40px auto;padding:0 20px;font-family:Georgia,serif;line-height:1.8;color:#1a1a1a}h1,h2,h3{font-family:system-ui,sans-serif}h1{font-size:2em;border-bottom:2px solid #eee;padding-bottom:8px}</style></head><body>${md}</body></html>`);
    }
    return res.redirect(`/api/files/download/${req.params.fileId}`);
  } catch { return res.status(500).send('Preview failed'); }
});

// ── DELETE ARTIFACT ─────────────────────────────────────────────────────────
// DELETE /api/files/artifacts/:fileId
router.delete('/artifacts/:fileId', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const { fileId } = req.params;
    const result = await pool.query(
      'DELETE FROM artifacts WHERE file_id = $1 RETURNING file_path', [fileId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Artifact not found' });

    // Clean up file on disk
    const filePath = result.rows[0].file_path;
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.json({ success: true, deleted: fileId });
  } catch (error) {
    logger.error('Delete artifact error', { error: error.message });
    return res.status(500).json({ error: 'Delete failed' });
  }
});

// ── PUBLISH TO SITE — set a slug for clean public URL ───────────────────────
// POST /api/files/publish-site/:fileId
router.post('/publish-site/:fileId', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const { fileId } = req.params;
    let { slug } = req.body;

    if (!slug) return res.status(400).json({ error: 'slug required' });

    // Sanitize slug: lowercase, alphanumeric + hyphens only
    slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
    if (!slug) return res.status(400).json({ error: 'Invalid slug' });

    // Check if slug is taken by another file
    const existing = await pool.query('SELECT file_id FROM artifacts WHERE slug = $1 AND file_id != $2', [slug, fileId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Slug "${slug}" is already taken`, suggestion: `${slug}-${Date.now().toString(36).slice(-4)}` });
    }

    await pool.query('UPDATE artifacts SET slug = $1, published = true WHERE file_id = $2', [slug, fileId]);

    const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const siteUrl = `${baseUrl}/s/${slug}`;

    return res.json({ success: true, slug, url: siteUrl });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to publish: ' + error.message });
  }
});

// ── UNPUBLISH — remove slug ─────────────────────────────────────────────────
router.delete('/publish-site/:fileId', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    await pool.query('UPDATE artifacts SET slug = NULL, published = false WHERE file_id = $1', [req.params.fileId]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ── PUBLISH WITH SLUG ───────────────────────────────────────────────────────
// POST /api/files/artifacts/:fileId/publish — set slug and make live at /p/:slug
router.post('/artifacts/:fileId/publish', async (req, res) => {
  try {
    const pool = await getPool();
    await ensureTable(pool);
    const { fileId } = req.params;
    let { slug } = req.body;

    if (!slug) return res.status(400).json({ error: 'slug is required' });

    // Sanitize slug: lowercase, alphanumeric + hyphens only
    slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
    if (!slug) return res.status(400).json({ error: 'Invalid slug' });

    // Check slug uniqueness (excluding this file)
    const existing = await pool.query('SELECT file_id FROM artifacts WHERE slug = $1 AND file_id != $2', [slug, fileId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Slug "${slug}" is already taken`, taken: true });
    }

    const result = await pool.query(
      `UPDATE artifacts SET slug = $1, published = true WHERE file_id = $2 RETURNING file_id, name, slug`,
      [slug, fileId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Artifact not found' });

    logger.info('Artifact published', { fileId, slug });
    return res.json({
      success: true,
      slug,
      url: `/p/${slug}`,
      artifact: result.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ error: 'Publish failed: ' + error.message });
  }
});

// POST /api/files/artifacts/:fileId/unpublish
router.post('/artifacts/:fileId/unpublish', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.query(
      `UPDATE artifacts SET published = false WHERE file_id = $1 RETURNING file_id, name, slug`,
      [req.params.fileId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Artifact not found' });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
