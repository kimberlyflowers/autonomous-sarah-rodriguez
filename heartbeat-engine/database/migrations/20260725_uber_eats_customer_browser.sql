-- Replace the incorrect merchant eats.order OAuth connector with the
-- customer-facing discovery and tenant browser-handoff model.
UPDATE connectors
SET
  category = 'ecommerce',
  -- "webhook" is the existing schema's non-credential/custom handoff type.
  -- The API exposes the more precise connectionMode="browser_handoff".
  auth_type = 'webhook',
  oauth_auth_url = NULL,
  oauth_token_url = NULL,
  oauth_scopes = ARRAY[]::text[],
  docs_url = 'https://help.uber.com/en/ubereats/restaurants/article/claude-integration-for-eaters?nodeId=f076b231-b5c7-448e-bd52-b378506b3cb7',
  active = true
WHERE slug = 'uber-eats';

-- Merchant OAuth grants must not be reused for consumer purchasing.
UPDATE user_connectors
SET
  status = 'inactive',
  access_token = NULL,
  refresh_token = NULL,
  granted_scopes = ARRAY[]::text[],
  last_error = 'Reconnect using the tenant Uber Eats browser handoff.',
  updated_at = NOW()
WHERE connector_id = (SELECT id FROM connectors WHERE slug = 'uber-eats')
  AND (
    COALESCE(array_length(granted_scopes, 1), 0) > 0
    OR access_token IS NOT NULL
    OR refresh_token IS NOT NULL
  );
