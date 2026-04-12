// heartbeat-engine/src/integrations/oauth.js
// Complete OAuth2 implementation for all BLOOM connectors
// Sources: official provider OAuth documentation
// Last updated: 2026-03-10

const CONNECTORS = {

  // ══════════════════════════════════════════════════════
  // GOOGLE SUITE
  // ══════════════════════════════════════════════════════

  'gmail': {
    name: 'Gmail',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    extraParams: { access_type: 'offline', prompt: 'consent' },
    envClientId: 'GOOGLE_OAUTH_CLIENT_ID',
    envClientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },

  'google-calendar': {
    name: 'Google Calendar',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    extraParams: { access_type: 'offline', prompt: 'consent' },
    envClientId: 'GOOGLE_OAUTH_CLIENT_ID',
    envClientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },

  'google-drive': {
    name: 'Google Drive',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    extraParams: { access_type: 'offline', prompt: 'consent' },
    envClientId: 'GOOGLE_OAUTH_CLIENT_ID',
    envClientSecret: 'GOOGLE_OAUTH_CLIENT_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // MICROSOFT
  // ══════════════════════════════════════════════════════

  'microsoft-365': {
    name: 'Microsoft 365',
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scopes: [
      'https://graph.microsoft.com/Mail.Read',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/Files.ReadWrite.All',
      'https://graph.microsoft.com/Chat.Read',
      'offline_access',
    ],
    extraParams: {},
    envClientId: 'MICROSOFT_CLIENT_ID',
    envClientSecret: 'MICROSOFT_CLIENT_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // PRODUCTIVITY / PROJECT MANAGEMENT
  // ══════════════════════════════════════════════════════

  'notion': {
    name: 'Notion',
    authUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: [],
    extraParams: { owner: 'user' },
    tokenAuthMethod: 'basic',
    envClientId: 'NOTION_CLIENT_ID',
    envClientSecret: 'NOTION_CLIENT_SECRET',
  },

  'slack': {
    name: 'Slack',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    scopes: [
      'channels:read',
      'channels:history',
      'chat:write',
      'files:read',
      'users:read',
      'im:read',
      'im:write',
    ],
    extraParams: {},
    tokenAuthMethod: 'basic',
    envClientId: 'SLACK_CLIENT_ID',
    envClientSecret: 'SLACK_CLIENT_SECRET',
  },

  'asana': {
    name: 'Asana',
    authUrl: 'https://app.asana.com/-/oauth_authorize',
    tokenUrl: 'https://app.asana.com/-/oauth_token',
    scopes: ['default'],
    extraParams: {},
    envClientId: 'ASANA_CLIENT_ID',
    envClientSecret: 'ASANA_CLIENT_SECRET',
  },

  'atlassian': {
    name: 'Atlassian (Jira + Confluence)',
    authUrl: 'https://auth.atlassian.com/authorize',
    tokenUrl: 'https://auth.atlassian.com/oauth/token',
    scopes: [
      'read:jira-work',
      'write:jira-work',
      'read:confluence-content.all',
      'write:confluence-content',
      'offline_access',
    ],
    extraParams: {
      audience: 'api.atlassian.com',
      prompt: 'consent',
    },
    envClientId: 'ATLASSIAN_CLIENT_ID',
    envClientSecret: 'ATLASSIAN_CLIENT_SECRET',
  },

  'linear': {
    name: 'Linear',
    authUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    scopes: ['read', 'write', 'issues:create'],
    extraParams: { prompt: 'consent' },
    envClientId: 'LINEAR_CLIENT_ID',
    envClientSecret: 'LINEAR_CLIENT_SECRET',
  },

  'monday': {
    name: 'monday.com',
    authUrl: 'https://auth.monday.com/oauth2/authorize',
    tokenUrl: 'https://auth.monday.com/oauth2/token',
    scopes: ['me:read', 'boards:read', 'boards:write', 'workspaces:read'],
    extraParams: {},
    envClientId: 'MONDAY_CLIENT_ID',
    envClientSecret: 'MONDAY_CLIENT_SECRET',
  },

  'clickup': {
    name: 'ClickUp',
    authUrl: 'https://app.clickup.com/api',
    tokenUrl: 'https://api.clickup.com/api/v2/oauth/token',
    scopes: [],
    extraParams: {},
    envClientId: 'CLICKUP_CLIENT_ID',
    envClientSecret: 'CLICKUP_CLIENT_SECRET',
  },

  'smartsheet': {
    name: 'Smartsheet',
    authUrl: 'https://app.smartsheet.com/b/authorize',
    tokenUrl: 'https://api.smartsheet.com/2.0/token',
    scopes: ['READ_SHEETS', 'WRITE_SHEETS', 'SHARE_SHEETS'],
    extraParams: {},
    envClientId: 'SMARTSHEET_CLIENT_ID',
    envClientSecret: 'SMARTSHEET_CLIENT_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // DESIGN / CREATIVE
  // ══════════════════════════════════════════════════════

  'canva': {
    name: 'Canva',
    authUrl: 'https://www.canva.com/api/oauth/authorize',
    tokenUrl: 'https://api.canva.com/rest/v1/oauth/token',
    scopes: [
      'asset:read',
      'asset:write',
      'brandtemplate:content:read',
      'brandtemplate:meta:read',
      'design:content:read',
      'design:content:write',
      'design:meta:read',
      'profile:read',
    ],
    extraParams: {},
    requiresPKCE: true,
    envClientId: 'CANVA_CLIENT_ID',
    envClientSecret: 'CANVA_CLIENT_SECRET',
  },

  'figma': {
    name: 'Figma',
    authUrl: 'https://www.figma.com/oauth',
    tokenUrl: 'https://www.figma.com/api/oauth/token',
    scopes: ['file_read'],
    extraParams: {},
    envClientId: 'FIGMA_CLIENT_ID',
    envClientSecret: 'FIGMA_CLIENT_SECRET',
  },

  'miro': {
    name: 'Miro',
    authUrl: 'https://miro.com/oauth/authorize',
    tokenUrl: 'https://api.miro.com/v1/oauth/token',
    scopes: ['boards:read', 'boards:write'],
    extraParams: {},
    envClientId: 'MIRO_CLIENT_ID',
    envClientSecret: 'MIRO_CLIENT_SECRET',
  },

  'cloudinary': {
    name: 'Cloudinary',
    authType: 'api_key',
    instructions: 'Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to Railway env vars.',
  },

  // ══════════════════════════════════════════════════════
  // CRM / SALES / MARKETING
  // ══════════════════════════════════════════════════════

  'hubspot': {
    name: 'HubSpot',
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    scopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.objects.companies.read',
    ],
    extraParams: {},
    envClientId: 'HUBSPOT_CLIENT_ID',
    envClientSecret: 'HUBSPOT_CLIENT_SECRET',
  },

  'activecampaign': {
    name: 'ActiveCampaign',
    authType: 'api_key',
    instructions: 'Add ACTIVECAMPAIGN_API_URL and ACTIVECAMPAIGN_API_KEY to Railway env vars. Found in AC Account → Settings → Developer.',
  },

  'intercom': {
    name: 'Intercom',
    authUrl: 'https://app.intercom.com/oauth',
    tokenUrl: 'https://api.intercom.io/auth/eagle/token',
    scopes: [],
    extraParams: {},
    envClientId: 'INTERCOM_CLIENT_ID',
    envClientSecret: 'INTERCOM_CLIENT_SECRET',
  },

  'apollo': {
    name: 'Apollo.io',
    authType: 'api_key',
    instructions: 'Add APOLLO_API_KEY to Railway env vars. Found in Apollo → Settings → Integrations → API.',
  },

  'klaviyo': {
    name: 'Klaviyo',
    authUrl: 'https://www.klaviyo.com/oauth/authorize',
    tokenUrl: 'https://a.klaviyo.com/oauth/token',
    scopes: [
      'campaigns:read',
      'campaigns:write',
      'lists:read',
      'lists:write',
      'profiles:read',
      'profiles:write',
      'metrics:read',
    ],
    extraParams: {},
    requiresPKCE: true,
    envClientId: 'KLAVIYO_CLIENT_ID',
    envClientSecret: 'KLAVIYO_CLIENT_SECRET',
  },

  'mailerlite': {
    name: 'MailerLite',
    authType: 'api_key',
    instructions: 'Add MAILERLITE_API_KEY to Railway env vars. Found in MailerLite → Integrations → Developer API.',
  },

  'ahrefs': {
    name: 'Ahrefs',
    authUrl: 'https://ahrefs.com/api/oauth2/authorize',
    tokenUrl: 'https://ahrefs.com/api/oauth2/token',
    scopes: ['analytics.readonly'],
    extraParams: {},
    envClientId: 'AHREFS_CLIENT_ID',
    envClientSecret: 'AHREFS_CLIENT_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // SOCIAL MEDIA
  // ══════════════════════════════════════════════════════

  'linkedin': {
    name: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['openid', 'profile', 'email', 'w_member_social'],
    extraParams: {},
    envClientId: 'LINKEDIN_CLIENT_ID',
    envClientSecret: 'LINKEDIN_CLIENT_SECRET',
  },

  'facebook': {
    name: 'Facebook',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_engagement',
    ],
    extraParams: {},
    envClientId: 'META_APP_ID',
    envClientSecret: 'META_APP_SECRET',
  },

  'instagram': {
    name: 'Instagram',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scopes: [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_insights',
      'pages_show_list',
    ],
    extraParams: {},
    envClientId: 'META_APP_ID',
    envClientSecret: 'META_APP_SECRET',
  },

  'tiktok': {
    name: 'TikTok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'video.list', 'video.publish'],
    extraParams: {},
    clientIdParam: 'client_key',
    envClientId: 'TIKTOK_CLIENT_KEY',
    envClientSecret: 'TIKTOK_CLIENT_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // PAYMENTS / FINANCIAL
  // ══════════════════════════════════════════════════════

  'stripe': {
    name: 'Stripe',
    authType: 'api_key',
    instructions: 'Add STRIPE_SECRET_KEY to Railway env vars.',
  },

  'paypal': {
    name: 'PayPal',
    authUrl: 'https://www.paypal.com/signin/authorize',
    tokenUrl: 'https://api-m.paypal.com/v1/oauth2/token',
    scopes: ['openid', 'profile', 'email', 'https://uri.paypal.com/services/invoicing'],
    extraParams: {},
    tokenAuthMethod: 'basic',
    envClientId: 'PAYPAL_CLIENT_ID',
    envClientSecret: 'PAYPAL_CLIENT_SECRET',
  },

  'square': {
    name: 'Square',
    authUrl: 'https://connect.squareup.com/oauth2/authorize',
    tokenUrl: 'https://connect.squareup.com/oauth2/token',
    scopes: [
      'ORDERS_READ',
      'ORDERS_WRITE',
      'PAYMENTS_READ',
      'PAYMENTS_WRITE',
      'CUSTOMERS_READ',
      'CUSTOMERS_WRITE',
    ],
    extraParams: {},
    envClientId: 'SQUARE_APPLICATION_ID',
    envClientSecret: 'SQUARE_APPLICATION_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // STORAGE / FILES
  // ══════════════════════════════════════════════════════

  'airtable': {
    name: 'Airtable',
    authUrl: 'https://airtable.com/oauth2/v1/authorize',
    tokenUrl: 'https://airtable.com/oauth2/v1/token',
    scopes: [
      'data.records:read',
      'data.records:write',
      'schema.bases:read',
    ],
    extraParams: {},
    requiresPKCE: true,
    envClientId: 'AIRTABLE_CLIENT_ID',
    envClientSecret: 'AIRTABLE_CLIENT_SECRET',
  },

  'box': {
    name: 'Box',
    authUrl: 'https://account.box.com/api/oauth2/authorize',
    tokenUrl: 'https://api.box.com/oauth2/token',
    scopes: [],
    extraParams: {},
    envClientId: 'BOX_CLIENT_ID',
    envClientSecret: 'BOX_CLIENT_SECRET',
  },

  'dropbox': {
    name: 'Dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scopes: ['files.content.read', 'files.content.write', 'sharing.read'],
    extraParams: { token_access_type: 'offline' },
    envClientId: 'DROPBOX_CLIENT_ID',
    envClientSecret: 'DROPBOX_CLIENT_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // WEB / CMS / DEV TOOLS
  // ══════════════════════════════════════════════════════

  'wordpress': {
    name: 'WordPress.com',
    authUrl: 'https://public-api.wordpress.com/oauth2/authorize',
    tokenUrl: 'https://public-api.wordpress.com/oauth2/token',
    scopes: ['posts', 'media', 'sites'],
    extraParams: {},
    envClientId: 'WORDPRESS_CLIENT_ID',
    envClientSecret: 'WORDPRESS_CLIENT_SECRET',
  },

  'webflow': {
    name: 'Webflow',
    authUrl: 'https://webflow.com/oauth/authorize',
    tokenUrl: 'https://api.webflow.com/oauth/access_token',
    scopes: ['cms:read', 'cms:write', 'pages:read', 'pages:write', 'sites:read'],
    extraParams: {},
    envClientId: 'WEBFLOW_CLIENT_ID',
    envClientSecret: 'WEBFLOW_CLIENT_SECRET',
  },

  'wix': {
    name: 'Wix',
    authUrl: 'https://www.wix.com/installer/install',
    tokenUrl: 'https://www.wixapis.com/oauth/access',
    scopes: [],
    extraParams: {},
    envClientId: 'WIX_CLIENT_ID',
    envClientSecret: 'WIX_CLIENT_SECRET',
  },

  'netlify': {
    name: 'Netlify',
    authUrl: 'https://app.netlify.com/authorize',
    tokenUrl: 'https://api.netlify.com/oauth/token',
    scopes: [],
    extraParams: {},
    envClientId: 'NETLIFY_CLIENT_ID',
    envClientSecret: 'NETLIFY_CLIENT_SECRET',
  },

  'vercel': {
    name: 'Vercel',
    authUrl: 'https://vercel.com/oauth/authorize',
    tokenUrl: 'https://api.vercel.com/v2/oauth/access_token',
    scopes: [],
    extraParams: {},
    envClientId: 'VERCEL_CLIENT_ID',
    envClientSecret: 'VERCEL_CLIENT_SECRET',
  },

  'github': {
    name: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: ['repo', 'read:user', 'user:email'],
    extraParams: {},
    envClientId: 'GITHUB_CLIENT_ID',
    envClientSecret: 'GITHUB_CLIENT_SECRET',
  },

  'sentry': {
    name: 'Sentry',
    authUrl: 'https://sentry.io/oauth/authorize/',
    tokenUrl: 'https://sentry.io/api/0/sentry-app-installations/{uuid}/authorizations/',
    scopes: ['project:read', 'event:read', 'org:read'],
    extraParams: {},
    envClientId: 'SENTRY_CLIENT_ID',
    envClientSecret: 'SENTRY_CLIENT_SECRET',
  },

  'supabase': {
    name: 'Supabase',
    authUrl: 'https://api.supabase.com/v1/oauth/authorize',
    tokenUrl: 'https://api.supabase.com/v1/oauth/token',
    scopes: [],
    extraParams: {},
    requiresPKCE: true,
    envClientId: 'SUPABASE_OAUTH_CLIENT_ID',
    envClientSecret: 'SUPABASE_OAUTH_CLIENT_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // MEETINGS / COMMS
  // ══════════════════════════════════════════════════════

  'zoom': {
    name: 'Zoom',
    authUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    scopes: [], // empty = Zoom grants all scopes configured on the Marketplace app (729 scopes across all categories)
    extraParams: {},
    tokenAuthMethod: 'basic',
    envClientId: 'ZOOM_CLIENT_ID',
    envClientSecret: 'ZOOM_CLIENT_SECRET',
  },

  'fireflies': {
    name: 'Fireflies',
    authType: 'api_key',
    instructions: 'Add FIREFLIES_API_KEY to Railway env vars. Found in Fireflies → Integrations → API.',
  },

  // ══════════════════════════════════════════════════════
  // AUTOMATION
  // ══════════════════════════════════════════════════════

  'zapier': {
    name: 'Zapier',
    authUrl: 'https://zapier.com/oauth/authorize/',
    tokenUrl: 'https://zapier.com/oauth/token/',
    scopes: ['zap', 'profile'],
    extraParams: {},
    envClientId: 'ZAPIER_CLIENT_ID',
    envClientSecret: 'ZAPIER_CLIENT_SECRET',
  },

  'make': {
    name: 'Make (Integromat)',
    authType: 'api_key',
    instructions: 'Add MAKE_API_KEY to Railway env vars. Found in Make → Profile → API.',
  },

  'n8n': {
    name: 'n8n',
    authType: 'api_key',
    instructions: 'Add N8N_API_KEY to Railway env vars.',
  },

  // ══════════════════════════════════════════════════════
  // E-COMMERCE
  // ══════════════════════════════════════════════════════

  'shopify': {
    name: 'Shopify',
    authUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
    tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token',
    scopes: [
      'read_products',
      'write_products',
      'read_orders',
      'write_orders',
      'read_customers',
      'write_customers',
    ],
    extraParams: {},
    requiresShopDomain: true,
    envClientId: 'SHOPIFY_CLIENT_ID',
    envClientSecret: 'SHOPIFY_CLIENT_SECRET',
  },

  // ══════════════════════════════════════════════════════
  // DATA / ANALYTICS
  // ══════════════════════════════════════════════════════

  'amplitude': {
    name: 'Amplitude',
    authType: 'api_key',
    instructions: 'Add AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY to Railway env vars.',
  },

  'posthog': {
    name: 'PostHog',
    authType: 'api_key',
    instructions: 'Add POSTHOG_API_KEY and POSTHOG_PROJECT_ID to Railway env vars.',
  },

  // ══════════════════════════════════════════════════════
  // DOCS / LEGAL / SIGNATURES
  // ══════════════════════════════════════════════════════

  'docusign': {
    name: 'DocuSign',
    authUrl: 'https://account.docusign.com/oauth/auth',
    tokenUrl: 'https://account.docusign.com/oauth/token',
    scopes: ['signature', 'extended'],
    extraParams: {},
    envClientId: 'DOCUSIGN_CLIENT_ID',
    envClientSecret: 'DOCUSIGN_CLIENT_SECRET',
  },

  'jotform': {
    name: 'Jotform',
    authType: 'api_key',
    instructions: 'Add JOTFORM_API_KEY to Railway env vars. Found in Jotform → Account → API.',
  },

  // ══════════════════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════════════════

  'bitly': {
    name: 'Bitly',
    authUrl: 'https://bitly.com/oauth/authorize',
    tokenUrl: 'https://api-ssl.bitly.com/oauth/access_token',
    scopes: [],
    extraParams: {},
    envClientId: 'BITLY_CLIENT_ID',
    envClientSecret: 'BITLY_CLIENT_SECRET',
  },

  'gusto': {
    name: 'Gusto',
    authUrl: 'https://api.gusto.com/oauth/authorize',
    tokenUrl: 'https://api.gusto.com/oauth/token',
    scopes: [],
    extraParams: {},
    envClientId: 'GUSTO_CLIENT_ID',
    envClientSecret: 'GUSTO_CLIENT_SECRET',
  },

};

// ══════════════════════════════════════════════════════════════
// OAUTH HELPERS
// ══════════════════════════════════════════════════════════════

function getConnector(slug) {
  const connector = CONNECTORS[slug];
  if (!connector) {
    throw new Error(`Unknown connector: ${slug}. Available: ${Object.keys(CONNECTORS).join(', ')}`);
  }
  return connector;
}

function getAuthUrl(slug, redirectUri, state) {
  const connector = getConnector(slug);

  if (connector.authType === 'api_key') {
    throw new Error(`${connector.name} uses API key auth, not OAuth. ${connector.instructions}`);
  }

  if (connector.requiresPKCE) {
    throw new Error(`${connector.name} requires PKCE — not yet implemented. Flag for dev.`);
  }

  if (connector.requiresShopDomain) {
    throw new Error(`${connector.name} requires a shop domain before OAuth can begin.`);
  }

  const clientIdKey = connector.clientIdParam || 'client_id';
  const clientId = process.env[connector.envClientId];

  if (!clientId) {
    throw new Error(`Missing env var: ${connector.envClientId}`);
  }

  const baseParams = {
    [clientIdKey]: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    ...connector.extraParams,
  };

  // Only add scope param if there are scopes to request;
  // empty array means the provider grants all app-configured scopes
  if (connector.scopes.length > 0) {
    baseParams.scope = connector.scopes.join(' ');
  }

  const params = new URLSearchParams(baseParams);

  return `${connector.authUrl}?${params.toString()}`;
}

async function exchangeCodeForToken(slug, code, redirectUri) {
  const connector = getConnector(slug);

  if (connector.authType === 'api_key') {
    throw new Error(`${connector.name} uses API key auth, not OAuth.`);
  }

  const clientId = process.env[connector.envClientId];
  const clientSecret = process.env[connector.envClientSecret];

  if (!clientId || !clientSecret) {
    throw new Error(`Missing env vars: ${connector.envClientId} or ${connector.envClientSecret}`);
  }

  const bodyParams = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  };

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  // Some providers require HTTP Basic Auth for token exchange (Slack, Notion, PayPal)
  if (connector.tokenAuthMethod === 'basic') {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    headers['Authorization'] = `Basic ${creds}`;
    delete bodyParams.client_id;
    delete bodyParams.client_secret;
  }

  const response = await fetch(connector.tokenUrl, {
    method: 'POST',
    headers,
    body: new URLSearchParams(bodyParams).toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed for ${connector.name}: ${response.status} ${errorText}`);
  }

  return response.json();
}

function getConnectorList() {
  return Object.entries(CONNECTORS).map(([slug, c]) => ({
    slug,
    name: c.name,
    authType: c.authType || 'oauth2',
    requiresPKCE: c.requiresPKCE || false,
    requiresShopDomain: c.requiresShopDomain || false,
  }));
}

// ══════════════════════════════════════════════════════════════
// HIGH-LEVEL WRAPPERS (used by index.js routes)
// ══════════════════════════════════════════════════════════════

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'https://autonomous-sarah-rodriguez-production.up.railway.app';

/**
 * buildAuthUrl — encodes orgId into state, builds redirect URI, returns full auth URL
 * Called by GET /oauth/connect/:slug
 */
function buildAuthUrl(slug, orgId, userId) {
  const redirectUri = `${BASE_URL}/oauth/callback/${slug}`;
  const state = Buffer.from(JSON.stringify({ orgId, userId, slug, ts: Date.now() })).toString('base64url');
  return getAuthUrl(slug, redirectUri, state);
}

/**
 * handleCallback — exchanges code for token, saves to Supabase user_connectors
 * Called by GET /oauth/callback/:slug
 */
async function handleCallback(slug, code, state) {
  const connector = getConnector(slug);

  // Decode state to get orgId and userId
  let orgId, userId;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    orgId = decoded.orgId;
    userId = decoded.userId;
  } catch {
    throw new Error(`Invalid OAuth state parameter for ${slug}`);
  }

  if (!orgId) throw new Error(`Missing orgId in OAuth state for ${slug}`);
  // Default userId to Kimberly's UUID if not provided
  if (!userId) userId = '823e2fb5-2f8f-4279-9c84-c8f4bf78bcce';

  const redirectUri = `${BASE_URL}/oauth/callback/${slug}`;
  const tokenData = await exchangeCodeForToken(slug, code, redirectUri);

  // Save token to Supabase
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // Look up connector row by slug
  const { data: connectorRow, error: connectorErr } = await supabase
    .from('connectors')
    .select('id')
    .eq('slug', slug)
    .single();

  if (connectorErr || !connectorRow) {
    throw new Error(`Connector slug "${slug}" not found in connectors table. Add it first.`);
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  // Upsert into user_connectors (one row per org+connector)
  const { error: upsertErr } = await supabase
    .from('user_connectors')
    .upsert({
      connector_id: connectorRow.id,
      organization_id: orgId,
      connected_by: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      token_expires_at: expiresAt,
      granted_scopes: connector.scopes || [],
      status: 'active',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'connector_id,organization_id',
    });

  if (upsertErr) {
    throw new Error(`Failed to save ${connector.name} token: ${upsertErr.message}`);
  }

  return { connector: connector.name, slug, orgId };
}

export {
  CONNECTORS,
  getConnector,
  getAuthUrl,
  exchangeCodeForToken,
  getConnectorList,
  buildAuthUrl,
  handleCallback,
};
