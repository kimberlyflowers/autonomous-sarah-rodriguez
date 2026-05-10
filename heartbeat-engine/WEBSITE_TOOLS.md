# BLOOM Multi-Tenant Website Tools

The `website-mcp` server now exposes reusable website tools for every Bloomie. The goal is to let a Bloomie change a client site through safe actions instead of hand-editing random files first.

## Tool Categories

- Website registry: `list_websites`, `register_website`, `publish_website`, `deploy_site`
- Pages: `get_site_pages`, `create_page`, `update_page`, `publish_page`, `upsert_site_page`
- Events: `list_site_events`, `create_event`, `update_event`, `set_registration_link`, `connect_ghl_calendar`, `upsert_site_event`, `set_homepage_feature`
- Blog: `create_blog`, `create_blog_post`
- Existing build support: `get_layout_blueprint`, `bloom_clarify`, `task_progress`, `bloom_post_progress`

Every content-editing tool requires `org_id`. Most tools also accept either `site_id` or `site_slug`. This is what keeps Johnathon's Bloomie editing Johnathon's sites, and another Bloomie editing only that owner's sites.

## Data Model

- `client_sites` stores one site per organization/slug, with optional GitHub, Vercel, GHL, domain, and settings metadata.
- `site_pages` stores public pages served by `/p/:orgSlug` and `/p/:orgSlug/:pageSlug`.
- `website_events` stores reusable event details, ticket type, price, GHL registration URL/calendar ID, and publish status.
- `website_blog_posts` stores blog post records and also creates matching `site_pages` entries for public URLs.

Run `migrations/004_multitenant_website_tools.sql` before using these tools in production.

## Write Access

The public MCP endpoint only exposes the original build-support tools unless write access is enabled.

Recommended production setup:

```text
WEBSITE_MCP_WRITE_KEY=<long-random-secret>
```

Managed website agents automatically append that key to their `website-mcp` URL when the env var is set. For a trusted private deployment only, `WEBSITE_MCP_ENABLE_SITE_WRITES=true` can enable the write tools without a key.

## SABWB Example

Register the SABWB site under Johnathon's real organization ID:

```json
{
  "org_id": "JOHNATHON_ORG_ID",
  "site_name": "SABWB Website",
  "org_slug": "sabwb",
  "source_repo": "https://github.com/kimberlyflowers/sabwb-website",
  "vercel_project_id": "prj_lS97oQfLNjn2zjGMNj8Uu76e3PJX",
  "ghl_calendar_id": "7Zb2YaNTDpgEZxpAPkli",
  "published": true,
  "settings": {
    "production_url": "https://sabwb-redesign.vercel.app",
    "editing_mode": "github_vercel",
    "registration_source": "ghl"
  }
}
```

Then Bloomie can do user-friendly tasks:

- "Add a paid mixer event for June 12 and feature it on the homepage."
- "Create a blog post from this announcement."
- "Update the registration link for the conference."
- "Publish the new About page."
- "Deploy the site."

For custom-code sites like SABWB, GitHub/Vercel remain the production path. These tools give Bloomie a safe structured layer for the common edits, while GitHub access remains available for deeper developer-level changes.
