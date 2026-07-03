-- Migration: Add Shopify connector to connectors table
-- Date: 2026-07-03

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
  'Shopify',
  'shopify',
  'ecommerce',
  'oauth2',
  'https://{shop}.myshopify.com/admin/oauth/authorize',
  'https://{shop}.myshopify.com/admin/oauth/access_token',
  ARRAY['read_products', 'read_orders', 'read_customers'],
  'https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant',
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  auth_type = EXCLUDED.auth_type,
  oauth_auth_url = EXCLUDED.oauth_auth_url,
  oauth_token_url = EXCLUDED.oauth_token_url,
  oauth_scopes = EXCLUDED.oauth_scopes,
  docs_url = EXCLUDED.docs_url,
  active = EXCLUDED.active;
