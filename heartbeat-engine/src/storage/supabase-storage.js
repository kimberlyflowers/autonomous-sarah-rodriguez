// ═══════════════════════════════════════════════════════════════════════════
// BLOOM Supabase Storage — CDN-backed image hosting for generated assets
//
// Generated images → Supabase Storage (public bucket) → CDN URL
// HTML references images via permanent public URLs, not base64 or local paths
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('supabase-storage');

const BUCKET_NAME = 'bloom-images';

let _supabase = null;

function getClient() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    _supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return _supabase;
}

/**
 * Ensure the public bucket exists
 */
async function ensureBucket() {
  const supabase = getClient();
  if (!supabase) return false;

  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET_NAME);
    if (!exists) {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
      });
      if (error) {
        logger.error('Failed to create bucket:', error.message);
        return false;
      }
      logger.info(`Created public bucket: ${BUCKET_NAME}`);
    }
    return true;
  } catch (e) {
    logger.error('Bucket check failed:', e.message);
    return false;
  }
}

/**
 * Upload an image to Supabase Storage
 * @param {Buffer|string} data - Image data (Buffer or base64 string)
 * @param {string} filename - Filename with extension (e.g. 'hero-banner.png')
 * @param {string} mimeType - MIME type (default: 'image/png')
 * @returns {{ success: boolean, url?: string, path?: string, error?: string }}
 */
export async function uploadImage(data, filename, mimeType = 'image/png') {
  const supabase = getClient();
  if (!supabase) {
    return { success: false, error: 'Supabase not configured (set SUPABASE_URL + SUPABASE_SERVICE_KEY)' };
  }

  try {
    await ensureBucket();

    // Convert base64 string to Buffer if needed
    const buffer = typeof data === 'string'
      ? Buffer.from(data, 'base64')
      : data;

    // Organize by date: assets/2026/03/filename.png
    const now = new Date();
    const path = `assets/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${filename}`;

    const { data: uploadData, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(path, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      logger.error('Upload failed:', error.message);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(path);

    const publicUrl = urlData?.publicUrl;

    logger.info('Image uploaded to Supabase Storage', { path, url: publicUrl });

    return {
      success: true,
      url: publicUrl,
      path: path,
    };
  } catch (e) {
    logger.error('Upload error:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Check if Supabase Storage is available
 */
export function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

export default { uploadImage, isConfigured };
