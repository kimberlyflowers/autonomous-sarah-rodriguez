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

// File storage directory (persistent across deploys via Railway volume or /tmp for now)
const FILE_STORAGE = process.env.FILE_STORAGE_PATH || '/tmp/bloom-files';
if (!fs.existsSync(FILE_STORAGE)) fs.mkdirSync(FILE_STORAGE, { recursive: true });

async function getPool() {
  const { createPool } = await import('../../database/setup.js');
  return createPool();
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
      created_by VARCHAR(100) DEFAULT 'sarah',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
    CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_file_id ON artifacts(file_id);
  `);
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
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
  } finally { await pool.end(); }
});

// ── LIST ARTIFACTS ──────────────────────────────────────────────────────────
// GET /api/files/artifacts?status=approved&limit=50
router.get('/artifacts', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const { status, limit = 50, sessionId } = req.query;
    let query = 'SELECT id, file_id, session_id, name, description, file_type, mime_type, file_size, status, created_by, created_at, approved_at, metadata FROM artifacts';
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
      downloadUrl: `/api/files/download/${r.file_id}`,
      previewUrl: `/api/files/preview/${r.file_id}`
    }));

    return res.json({ artifacts, total: artifacts.length });
  } catch (error) {
    logger.error('List artifacts error', { error: error.message });
    return res.status(500).json({ error: 'Failed to list artifacts' });
  } finally { await pool.end(); }
});

// ── APPROVE / REJECT ARTIFACT ───────────────────────────────────────────────
// PATCH /api/files/artifacts/:fileId
router.patch('/artifacts/:fileId', async (req, res) => {
  let pool;
  try {
    pool = await getPool();
    await ensureTable(pool);
    const { fileId } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'

    logger.info('PATCH artifact request', { fileId, status });

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be approved or rejected' });
    }

    // Update status
    const result = await pool.query(
      `UPDATE artifacts SET status = $1 WHERE file_id = $2 RETURNING id, file_id, name, status`,
      [status, fileId]
    );

    if (!result.rows.length) {
      logger.warn('Artifact not found for PATCH', { fileId });
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Set approved_at separately if approved
    if (status === 'approved') {
      await pool.query(`UPDATE artifacts SET approved_at = NOW() WHERE file_id = $1`, [fileId]);
    }

    logger.info(`Artifact ${status}`, { fileId, name: result.rows[0].name });
    return res.json({ success: true, artifact: result.rows[0] });
  } catch (error) {
    logger.error('Update artifact error', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Failed to update artifact: ' + error.message });
  } finally { if (pool) await pool.end().catch(()=>{}); }
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
  } finally { await pool.end(); }
});

// ── PREVIEW FILE ────────────────────────────────────────────────────────────
// GET /api/files/preview/:fileId
router.get('/preview/:fileId', async (req, res) => {
  const pool = await getPool();
  try {
    await ensureTable(pool);
    const { fileId } = req.params;
    const result = await pool.query(
      'SELECT name, file_type, mime_type, content_text, thumbnail_base64, file_path FROM artifacts WHERE file_id = $1', [fileId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' });

    const file = result.rows[0];

    // For images — serve the actual image inline
    if (file.file_type === 'image' && file.file_path && fs.existsSync(file.file_path)) {
      res.setHeader('Content-Type', file.mime_type || 'image/png');
      return fs.createReadStream(file.file_path).pipe(res);
    }

    // For text content — return as JSON for rendering
    if (file.content_text) {
      return res.json({
        name: file.name,
        fileType: file.file_type,
        mimeType: file.mime_type,
        content: file.content_text
      });
    }

    // For binary files — return metadata only
    return res.json({ name: file.name, fileType: file.file_type, mimeType: file.mime_type, preview: 'binary' });
  } catch (error) {
    logger.error('Preview error', { error: error.message });
    return res.status(500).json({ error: 'Preview failed' });
  } finally { await pool.end(); }
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
  } finally { await pool.end(); }
});

export default router;
