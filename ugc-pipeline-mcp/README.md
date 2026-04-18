# UGC Pipeline MCP Connector

BLOOM connector that exposes the [UGC Pipeline](../ugc-pipeline) as MCP tools so any Bloomie agent (Sarah Rodriguez, custom Bloomies) can become the **creative brain** for content generation.

## Architecture

```
┌──────────────┐  MCP   ┌─────────────────┐  REST  ┌───────────────┐  HTTPS  ┌──────────┐
│   Bloomie    │───────▶│   This MCP      │───────▶│  UGC Pipeline │────────▶│ WaveSpeed│
│   (Sarah)    │  /mcp  │   (port 3200)   │  /api  │ (Railway svc) │         │ Seedance │
└──────────────┘        └─────────────────┘        └───────────────┘         └──────────┘
                                                          │
                                                          ▼
                                                    ┌───────────┐
                                                    │  Web UI   │  ← also usable
                                                    │ (humans)  │     standalone
                                                    └───────────┘
```

## Tools Exposed

### Brand Management
- `ugc_list_brands` — list all brands
- `ugc_get_brand` — fetch full brand profile
- `ugc_create_brand` — create or update a brand
- `ugc_update_brand` — patch specific fields
- `ugc_delete_brand` — delete a brand

### Asset Management
- `ugc_list_assets` — list all uploaded assets
- `ugc_get_temp_asset_url` — get 10-min hosted URL for API submission
- `ugc_analyze_assets` — run AI vision analysis on uploads
- `ugc_delete_asset` — delete an asset

### Video Generation
- `ugc_estimate_cost` — preview cost (no charge)
- `ugc_preview_variants` — generate prompt variants for review (no charge)
- `ugc_submit_batch` — submit approved variants to Seedance API ($)
- `ugc_generate_custom` — single video with agent-crafted prompt ($)

### Job Tracking
- `ugc_list_videos` — list all generation jobs
- `ugc_check_status` — check single video status
- `ugc_poll_pending` — force-poll all pending jobs
- `ugc_list_local_files` — list downloaded video files

### Reference Docs (the agentic part)
- `ugc_list_docs` — list available reference docs
- `ugc_get_seedance_docs` — read official ByteDance Seedance 2.0 spec
- `ugc_get_prompt_guide` — read Sirio's UGC framework
- `ugc_get_api_docs` — read WaveSpeed API spec
- `ugc_pipeline_status` — health + stats

## How a Bloomie uses this

**Conversational example:**

> User: "Sarah, generate 8 ads for AG1 — mix of UGC and lifestyle, vertical for TikTok"

Sarah's tool sequence:
1. `ugc_get_brand("ag1")` — load brand context
2. `ugc_list_assets` — confirm subject + product images exist
3. `ugc_get_seedance_docs` + `ugc_get_prompt_guide` — refresh on prompting rules
4. `ugc_estimate_cost(variants=8, duration=15, resolution="720p", model="seedance2-fast")` — confirm budget
5. `ugc_preview_variants(brandSlug="ag1", formats=["ugc","lifestyle"])` — generate 8 variant prompts
6. Show variants to user, get approval
7. `ugc_submit_batch(variants=approved)` — submit to Seedance
8. `ugc_check_status(requestId)` periodically until complete
9. Report back: "3 done, 5 rendering — here are the completed URLs"

The agent is the brain. The pipeline is the engine. The user just talks.

## Deployment

### Local dev
```bash
cd ugc-pipeline-mcp
npm install
UGC_PIPELINE_URL=http://localhost:8080 npm run dev
```

### Railway
Add as a new service in the BLOOM project, root directory `ugc-pipeline-mcp/`. Set env vars:
```
UGC_PIPELINE_URL=https://ugc-pipeline-production.up.railway.app
UGC_PIPELINE_API_KEY=<key from pipeline's UGC_API_KEYS>
PORT=3200
```

## Wiring into a Bloomie

Add to the agent's MCP server config:
```json
{
  "ugc-pipeline": {
    "url": "https://ugc-pipeline-mcp-production.up.railway.app/mcp"
  }
}
```

Now Sarah (or any Bloomie) can call all `ugc_*` tools.

## Standalone vs. Connector mode

- **Standalone** (no Bloomie): humans use the web UI at `ugc-pipeline.railway.app`
- **Connector** (with Bloomie): agents use these MCP tools, humans optionally watch via the web UI

Both modes share the same brand profiles, assets, and generated videos — single source of truth.
