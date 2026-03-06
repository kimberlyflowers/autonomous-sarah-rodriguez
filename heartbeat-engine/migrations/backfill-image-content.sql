-- Migration: Backfill content_text for existing images
-- This copies thumbnail_base64 to content_text so old images can be previewed

UPDATE artifacts 
SET content_text = thumbnail_base64
WHERE file_type = 'image' 
  AND content_text IS NULL 
  AND thumbnail_base64 IS NOT NULL;
