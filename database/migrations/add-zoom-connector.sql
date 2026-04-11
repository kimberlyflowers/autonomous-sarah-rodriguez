-- Migration: Add Zoom connector to connectors table
-- Ticket: 578b0355
-- Date: 2026-04-10

INSERT INTO connectors (
  name,
  slug,
  category,
  auth_type,
  oauth_auth_url,
  oauth_token_url,
  oauth_scopes,
  docs_url,
  active
)
VALUES (
  'Zoom',
  'zoom',
  'communication',
  'oauth2',
  'https://zoom.us/oauth/authorize',
  'https://zoom.us/oauth/token',
  ARRAY['cloud_recording:read', 'recording:read', 'meeting:read', 'user:read'],
  'https://developers.zoom.us/docs/integrations/oauth/',
  true
)
ON CONFLICT (slug) DO NOTHING;
