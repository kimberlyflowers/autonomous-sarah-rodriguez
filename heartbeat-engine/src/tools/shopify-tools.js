import { createClient } from '@supabase/supabase-js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('shopify-tools');

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-01';
const DEFAULT_ORG_ID = 'a1000000-0000-0000-0000-000000000001';

export const shopifyToolDefinitions = [
  {
    name: 'shopify_get_shop',
    description: 'Get connected Shopify store identity, primary domain, currency, and plan details.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'shopify_list_products',
    description: 'List products from the connected Shopify store. Use for inventory and catalog visibility.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of products to return. Defaults to 10, maximum 50.' },
        query: { type: 'string', description: 'Optional Shopify product search query.' }
      },
      required: []
    }
  },
  {
    name: 'shopify_list_orders',
    description: 'List recent orders from the connected Shopify store. Use for fulfillment and customer/order visibility.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of orders to return. Defaults to 10, maximum 50.' },
        query: { type: 'string', description: 'Optional Shopify order search query, such as fulfillment_status:unfulfilled.' }
      },
      required: []
    }
  }
];

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function normalizeShopDomain(value) {
  const raw = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (!raw) return null;
  if (raw.includes('.')) return raw;
  return `${raw}.myshopify.com`;
}

async function getShopifyCredentials(orgId) {
  const organizationId = orgId || DEFAULT_ORG_ID;
  const sb = getSupabase();

  const { data, error } = await sb
    .from('user_connectors')
    .select('access_token, api_key, external_account_id, external_account_name, connectors!inner(slug)')
    .eq('organization_id', organizationId)
    .eq('connectors.slug', 'shopify')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Shopify credential lookup failed: ${error.message}`);
  }

  const token = data?.access_token || data?.api_key;
  const shopDomain = normalizeShopDomain(data?.external_account_id || data?.external_account_name);

  if (!token || !shopDomain) {
    throw new Error('Shopify is not connected for this organization. Connect Shopify in Customize first.');
  }

  return { token, shopDomain, orgId: organizationId };
}

async function shopifyGraphql(orgId, query, variables = {}) {
  const creds = await getShopifyCredentials(orgId);
  const endpoint = `https://${creds.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': creds.token
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors) {
    const message = payload.errors?.map?.(e => e.message).join('; ') || JSON.stringify(payload) || response.statusText;
    throw new Error(`Shopify API error ${response.status}: ${message}`);
  }

  return payload.data;
}

function clampLimit(value) {
  const parsed = Number(value || 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(50, Math.floor(parsed)));
}

async function shopifyGetShop(input, orgId) {
  const data = await shopifyGraphql(orgId || input.orgId, `
    query BloomieShopInfo {
      shop {
        name
        myshopifyDomain
        url
        currencyCode
        primaryDomain { host url }
        plan { displayName partnerDevelopment }
      }
    }
  `);

  return { success: true, shop: data.shop };
}

async function shopifyListProducts(input, orgId) {
  const data = await shopifyGraphql(orgId || input.orgId, `
    query BloomieProducts($first: Int!, $query: String) {
      products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          status
          vendor
          productType
          totalInventory
          updatedAt
          variants(first: 5) {
            nodes {
              title
              sku
              price
              inventoryQuantity
            }
          }
        }
      }
    }
  `, { first: clampLimit(input.limit), query: input.query || null });

  return { success: true, products: data.products.nodes, count: data.products.nodes.length };
}

async function shopifyListOrders(input, orgId) {
  const data = await shopifyGraphql(orgId || input.orgId, `
    query BloomieOrders($first: Int!, $query: String) {
      orders(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          name
          email
          displayFinancialStatus
          displayFulfillmentStatus
          createdAt
          updatedAt
          totalPriceSet { shopMoney { amount currencyCode } }
          customer { displayName email }
          lineItems(first: 10) {
            nodes {
              title
              quantity
              sku
            }
          }
        }
      }
    }
  `, { first: clampLimit(input.limit), query: input.query || null });

  return { success: true, orders: data.orders.nodes, count: data.orders.nodes.length };
}

export async function executeShopifyTool(toolName, input = {}, orgId = null) {
  logger.info('Executing Shopify tool', { toolName, orgId: orgId || input.orgId || DEFAULT_ORG_ID });

  try {
    switch (toolName) {
      case 'shopify_get_shop':
        return await shopifyGetShop(input, orgId);
      case 'shopify_list_products':
        return await shopifyListProducts(input, orgId);
      case 'shopify_list_orders':
        return await shopifyListOrders(input, orgId);
      default:
        return { success: false, error: `Unknown Shopify tool: ${toolName}` };
    }
  } catch (error) {
    logger.warn('Shopify tool failed', { toolName, error: error.message });
    return { success: false, error: error.message };
  }
}
