# Bloomie Connector Contract

Bloomie connectors should behave like Codex or ChatGPT-style plugins from the tenant's point of view:

1. The tenant clicks **Connect** in Customize.
2. Bloomie sends them to the provider's authorization screen.
3. The tenant approves access for their own account.
4. Bloomie stores that tenant grant under their `organization_id`.
5. Bloomie tools become available only for that tenant's connected account.

Tenants must never need Railway access, platform env vars, Supabase service keys, or a provider client secret.

## Credential Ownership

There are two different kinds of credentials.

**Platform OAuth app credentials**

- Owned by Bloomie.
- Stored in Railway/server env vars.
- Examples: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.
- Used only by the Bloomie backend to start OAuth, exchange authorization codes, and refresh tokens.
- Not visible to tenants.

**Tenant grants**

- Owned by the tenant.
- Created when the tenant approves the provider authorization screen.
- Stored in `user_connectors` with the tenant `organization_id`.
- Used by Bloomie tools at runtime.
- Disconnected by marking that tenant's `user_connectors` rows inactive.

## Database Model

`connectors` is the catalog. It describes what can be connected:

- `slug`
- `name`
- `category`
- `auth_type`
- provider/docs metadata
- active/support status

`user_connectors` is the tenant connection store. It describes what one organization has connected:

- `organization_id`
- `connector_id`
- `connected_by`
- `access_token`
- `refresh_token`
- `token_expires_at`
- `api_key` for non-OAuth legacy providers
- `external_account_id`
- `external_account_name`
- `status`
- `last_error`

Any Bloomie tool that calls an external app must resolve credentials from `user_connectors` using the current request's `organization_id`.

## OAuth Flow

The normal OAuth route is:

1. Dashboard calls `POST /api/integrations/:platform/start` with the user's JWT.
2. Backend resolves `organization_id` from that JWT.
3. Backend builds the provider authorization URL using Bloomie's platform client ID.
4. Backend encodes `organization_id`, `user_id`, and provider context into `state`.
5. Dashboard navigates the browser to the provider authorization URL.
6. Provider redirects to `GET /api/integrations/:platform/callback`.
7. Backend exchanges the code using Bloomie's platform client secret.
8. Backend stores the token rows in `user_connectors` for that `organization_id`.
9. Dashboard reloads `/api/integrations/list` and shows the connector as connected.

The callback must not rely on browser local state or a Railway admin session. The tenant/org identity comes from the signed user session during start and the `state` parameter during callback.

## Tool Runtime Rule

Tool executors must not use a master tenant account.

Correct:

- Gmail tools read the Gmail token from `user_connectors` for the active `organization_id`.
- Shopify tools read the Shopify token and shop domain from `user_connectors` for the active `organization_id`.
- GHL tools read the tenant PIT/location from `user_connectors` for the active `organization_id`.

Incorrect:

- A tenant clicking Connect has to enter a Railway env var.
- A Bloomie tool uses one shared provider account for all tenants.
- The model is asked to provide `organization_id` instead of the backend injecting it.
- UI marks a connector connected before `/api/integrations/list` confirms a tenant row.

## Non-OAuth Connectors

Some providers may not support a clean OAuth app flow. Those connectors are allowed only as explicit exceptions.

For example, GoHighLevel currently supports a tenant-supplied Private Integration Token flow in Bloomie. That is tenant-based, but it is not as smooth as a Codex-style OAuth connector. It should be labeled and treated as a legacy/manual credential connector until replaced by a provider authorization flow.

## Security Requirements

- Store tenant grants only in Bloomie-controlled infrastructure.
- Never expose provider client secrets to frontend code.
- Never ask tenants for Railway, Supabase, or deployment access.
- Scope every token lookup by `organization_id`.
- Keep provider refresh logic server-side.
- Do not include tokens or API keys in logs.
- Disconnect must affect only the current tenant's rows.
- New connector UI cards should be generated from the catalog where possible, not hardcoded only in React.

## Adding A New OAuth Connector

1. Add the provider to the backend platform registry.
2. Add or upsert its `connectors` catalog row.
3. Add required Bloomie-owned OAuth app env var names to `.env.example`.
4. Add UI metadata for icon/category/description if needed.
5. Add or wire provider tool executors.
6. Make tool executors resolve credentials from `user_connectors` by `organization_id`.
7. Test:
   - `/api/integrations/list` shows the connector.
   - clicking Connect returns a provider authorization URL.
   - callback stores a `user_connectors` row for the correct org.
   - chat tools use the connected tenant account.
   - disconnect marks only that tenant's row inactive.

