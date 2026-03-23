"""
BLOOM Browser Agent v3 — browser-use sidecar for Sarah Rodriguez

3-Tier Browser Fallback Chain (multi-tenant, all Bloomie users):
  Tier 1: Self-hosted Browserless on Railway (free, fastest)
  Tier 2: Browser Use Cloud (paid, anti-detect, CAPTCHA solving)
  Tier 3: BLOOM Desktop app (real browser on user's machine)

Each tier only triggers if the previous one fails or gets blocked.
Tiers 1+2 are server-side (no install needed for tenants).
Tier 3 is optional for users who have BLOOM Desktop installed.

Anti-bot detection uses two layers:
  - Structural HTML markers (Crawl4AI approach, need 2+ matches)
  - Agent result phrases (natural language, 1 match sufficient)

Docs:
- https://docs.browser-use.com/customize/agent/all-parameters
- https://docs.browser-use.com/customize/browser/all-parameters
- https://docs.crawl4ai.com/advanced/anti-bot-and-fallback/
"""

import os
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from browser_use import Agent, Browser, ChatAnthropic

# ── Logging
logging.basicConfig(level=logging.INFO, format="%(levelname)-5s [%(name)s] %(message)s")
log = logging.getLogger("browser-agent")

# ── Config
BROWSERLESS_WS_URL = os.getenv("BROWSERLESS_WS_URL", "")
BROWSERLESS_TOKEN = os.getenv("BROWSERLESS_TOKEN", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
SIDECAR_SECRET = os.getenv("SIDECAR_SECRET", "")
SARAH_BASE_URL = os.getenv("SARAH_BASE_URL", "http://autonomous-sarah-rodriguez.railway.internal:3000")
BROWSER_USE_API_KEY = os.getenv("BROWSER_USE_API_KEY", "")
PORT = int(os.getenv("PORT", "8080"))


# ═══════════════════════════════════════════════════════════════════════════
# ANTI-BOT BLOCK DETECTION
# Based on Crawl4AI's approach: use structural markers, not generic keywords.
# A page that *mentions* "Cloudflare" in normal content won't trigger this.
# We check for the specific phrases that appear on actual block/challenge pages.
# ═══════════════════════════════════════════════════════════════════════════

# Structural markers from actual Cloudflare/anti-bot block pages
BLOCK_SIGNATURES = [
    "sorry, you have been blocked",
    "you are unable to access",
    "attention required! | cloudflare",
    "please wait while we verify your browser",
    "ray id:",                              # Cloudflare Ray ID footer
    "error 1015",                           # Rate limited
    "error 1020",                           # Access denied
    "error 1010",                           # Browser integrity check
    "please turn javascript on and reload",  # JS challenge
    "hcaptcha_submit",                      # hCaptcha form element
    "cf-challenge-running",                 # Cloudflare challenge container
    "cf_chl_opt",                           # Cloudflare challenge script
    "managed by imperva",                   # Imperva/Incapsula
    "datadome",                             # DataDome
    "perimeterx",                           # PerimeterX
]

# Agent result text patterns — the browser-use agent describes what it sees,
# so Cloudflare blocks show up as natural language in the result, not raw HTML.
# These are single-match (any one = blocked) because they're unambiguous.
RESULT_BLOCK_PHRASES = [
    "blocked by cloudflare",
    "cloudflare challenge",
    "cloudflare security check",
    "access denied by cloudflare",
    "cloudflare is blocking",
    "captcha challenge",
    "browser verification",
    "unable to access the page",
    "page appears to be blocked",
    "anti-bot protection",
    "bot detection",
    "security challenge page",
    "verify you are human",
    "checking your browser",
    "just a moment while we verify",
]

def is_blocked(text: str) -> bool:
    """Detect if page content shows anti-bot blocking.

    Two-layer detection:
    1. Structural markers (need 2+ matches) — for raw HTML content
    2. Agent result phrases (need 1 match) — for natural language summaries

    Uses structural markers per Crawl4AI pattern to avoid false positives."""
    if not text:
        return False
    lower = text.lower()

    # Layer 1: Structural markers (need 2+ to confirm — reduces false positives)
    struct_matches = sum(1 for sig in BLOCK_SIGNATURES if sig in lower)
    if struct_matches >= 2:
        return True

    # Layer 2: Agent result phrases (any single match — these are unambiguous)
    for phrase in RESULT_BLOCK_PHRASES:
        if phrase in lower:
            return True

    return False


# ═══════════════════════════════════════════════════════════════════════════
# RESULT EXTRACTION HELPER
# Pulls data from browser-use AgentHistoryList in a consistent way
# ═══════════════════════════════════════════════════════════════════════════

def extract_result(result) -> dict:
    """Extract structured data from browser-use AgentHistoryList."""
    data = {
        "success": True,
        "result": "",
        "url_final": None,
        "steps_taken": 0,
        "screenshot_base64": None,
    }
    if not result:
        data["success"] = False
        data["result"] = "No result returned"
        return data

    # Final text
    try:
        fr = result.final_result()
        data["result"] = str(fr) if fr else str(result)
    except Exception:
        data["result"] = str(result)

    # Final URL
    try:
        urls = result.urls()
        if urls:
            data["url_final"] = urls[-1]
    except Exception:
        pass

    # Steps
    try:
        data["steps_taken"] = result.n_steps if hasattr(result, "n_steps") else len(result.history) if hasattr(result, "history") else 0
    except Exception:
        pass

    # Screenshot (last one captured)
    try:
        screenshots = result.screenshots()
        if screenshots:
            data["screenshot_base64"] = screenshots[-1]
    except Exception:
        pass

    return data


# ═══════════════════════════════════════════════════════════════════════════
# CORE: Run a browser-use Agent task
# Separated so we can call it for self-hosted OR cloud with same logic
# ═══════════════════════════════════════════════════════════════════════════

async def run_agent(task: str, max_steps: int, use_cloud: bool = False) -> dict:
    """Run a browser-use Agent. Returns extracted result dict.
    
    use_cloud=False → self-hosted Browserless (free)
    use_cloud=True  → Browser Use Cloud (paid, anti-detect, CAPTCHA solving)
    """
    browser_session = None
    try:
        # Create browser connection
        if use_cloud:
            browser_session = Browser(use_cloud=True)
            log.info("☁️  Connected to Browser Use Cloud (stealth)")
        else:
            cdp_url = build_cdp_url()
            browser_session = Browser(cdp_url=cdp_url, headless=True)
            log.info("🏠 Connected to self-hosted Browserless")

        # LLM
        llm = ChatAnthropic(
            model=ANTHROPIC_MODEL,
            api_key=ANTHROPIC_API_KEY,
            temperature=0,
        )

        # Agent
        agent = Agent(
            task=task,
            llm=llm,
            browser=browser_session,
            max_failures=3,
            use_vision=True,
        )

        # Run
        result = await agent.run(max_steps=max_steps)
        return extract_result(result)

    except Exception as e:
        log.error(f"Agent failed: {e}")
        return {"success": False, "error": str(e), "result": "", "url_final": None, "steps_taken": 0, "screenshot_base64": None}

    finally:
        try:
            if browser_session:
                await browser_session.close()
        except Exception:
            pass


# ═══════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def check_auth(secret: Optional[str]):
    if SIDECAR_SECRET and secret != SIDECAR_SECRET:
        raise HTTPException(status_code=401, detail="Invalid sidecar secret")


def build_cdp_url() -> str:
    base = BROWSERLESS_WS_URL.rstrip("/")
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}token={BROWSERLESS_TOKEN}&stealth=true"


async def push_screenshot(b64: str, url: str = None):
    """Push screenshot to Sarah's dashboard Screen Viewer via SSE."""
    if not SARAH_BASE_URL or not b64:
        return
    try:
        import aiohttp
        async with aiohttp.ClientSession() as s:
            await s.post(
                f"{SARAH_BASE_URL}/api/browser/push-screenshot",
                json={"data": b64, "url": url or ""},
                timeout=aiohttp.ClientTimeout(total=5),
            )
    except Exception:
        pass  # Non-critical — dashboard just won't update


async def check_desktop_available() -> bool:
    """Check if a BLOOM Desktop app is connected and available."""
    if not SARAH_BASE_URL:
        return False
    try:
        import aiohttp
        async with aiohttp.ClientSession() as s:
            resp = await s.get(
                f"{SARAH_BASE_URL}/api/desktop/status",
                timeout=aiohttp.ClientTimeout(total=3),
            )
            if resp.status == 200:
                data = await resp.json()
                return data.get("connected", False)
    except Exception:
        pass
    return False


async def run_via_desktop(task: str, url: str = None) -> dict:
    """Execute a browser task through a connected BLOOM Desktop app.

    This is the third-tier fallback — uses the real browser on the user's
    machine, which Cloudflare cannot distinguish from a real human.

    Sends a high-level command to the Desktop app's browser bridge.
    """
    if not SARAH_BASE_URL:
        return {"success": False, "error": "SARAH_BASE_URL not configured"}

    try:
        import aiohttp
        import uuid

        command_id = str(uuid.uuid4())

        # Build the desktop browser command
        # The Desktop app's browser-bridge supports: navigate, snapshot, click, type, etc.
        # We send a composite command that the desktop can execute step-by-step
        command_payload = {
            "commandId": command_id,
            "action": "browser_task",
            "data": {
                "task": task,
                "url": url,
                "source": "cloud-fallback",  # Desktop knows this is a fallback
            }
        }

        async with aiohttp.ClientSession() as s:
            # Queue command for desktop
            resp = await s.post(
                f"{SARAH_BASE_URL}/api/desktop/command",
                json=command_payload,
                timeout=aiohttp.ClientTimeout(total=5),
            )
            if resp.status != 200:
                return {"success": False, "error": f"Desktop command queue failed: {resp.status}"}

            # Poll for result (desktop executes and posts back)
            # Allow up to 120 seconds for complex browser tasks
            for _ in range(60):
                await asyncio.sleep(2)
                try:
                    result_resp = await s.get(
                        f"{SARAH_BASE_URL}/api/desktop/result/{command_id}",
                        timeout=aiohttp.ClientTimeout(total=5),
                    )
                    if result_resp.status == 200:
                        result_data = await result_resp.json()
                        if result_data.get("completed"):
                            return {
                                "success": result_data.get("success", True),
                                "result": result_data.get("result", "Task completed via BLOOM Desktop"),
                                "url_final": result_data.get("url", url),
                                "steps_taken": result_data.get("steps", 0),
                                "screenshot_base64": result_data.get("screenshot"),
                            }
                except Exception:
                    continue

            return {"success": False, "error": "Desktop task timed out after 120 seconds"}

    except Exception as e:
        return {"success": False, "error": f"Desktop fallback failed: {e}"}


# ═══════════════════════════════════════════════════════════════════════════
# FASTAPI APP
# ═══════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("🚀 BLOOM Browser Agent starting...")
    log.info(f"   Browserless: {'✅' if BROWSERLESS_WS_URL else '❌'}")
    log.info(f"   Anthropic:   {'✅' if ANTHROPIC_API_KEY else '❌'}")
    log.info(f"   Cloud Key:   {'✅ (fallback ready)' if BROWSER_USE_API_KEY else '❌ (no cloud fallback)'}")
    log.info(f"   Model:       {ANTHROPIC_MODEL}")
    yield
    log.info("Browser Agent shutting down.")

app = FastAPI(title="BLOOM Browser Agent", version="3.0.0", lifespan=lifespan)


# ── Models
class BrowseRequest(BaseModel):
    task: str = Field(..., description="Natural language task")
    url: Optional[str] = Field(None, description="Starting URL")
    max_steps: int = Field(25, ge=1, le=100)
    secret: Optional[str] = None

class BrowseResponse(BaseModel):
    success: bool
    result: Optional[str] = None
    error: Optional[str] = None
    steps_taken: int = 0
    duration_ms: int = 0
    url_final: Optional[str] = None
    screenshot_base64: Optional[str] = None
    used_cloud: bool = False
    used_desktop: bool = False
    tier_used: Optional[str] = None  # "self-hosted", "cloud", "desktop"

class ScreenshotRequest(BaseModel):
    url: str
    secret: Optional[str] = None

class ScreenshotResponse(BaseModel):
    success: bool
    screenshot_base64: Optional[str] = None
    error: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════
# /browse — THE MAIN ENDPOINT
#
# Pattern: Self-hosted first → detect block → cloud fallback
# Inspired by Crawl4AI's Anti-Bot & Fallback system
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/browse", response_model=BrowseResponse)
async def browse(req: BrowseRequest):
    check_auth(req.secret)

    if not ANTHROPIC_API_KEY:
        return BrowseResponse(success=False, error="ANTHROPIC_API_KEY not configured")

    start = asyncio.get_event_loop().time()

    # Build task
    task = req.task
    if req.url and req.url not in task:
        task = f"Navigate to {req.url}. Then: {task}"

    used_cloud = False
    used_desktop = False

    # ═══════════════════════════════════════════════════════════════════
    # 3-TIER BROWSER FALLBACK CHAIN
    #
    # Tier 1: Self-hosted Browserless on Railway (free, fastest)
    # Tier 2: Browser Use Cloud (paid, anti-detect, CAPTCHA solving)
    # Tier 3: BLOOM Desktop app (real browser on user's machine)
    #
    # Each tier only triggers if the previous one fails or gets blocked.
    # This works for ALL tenants — Tier 1+2 are server-side (no install),
    # Tier 3 is optional for users who have BLOOM Desktop installed.
    # ═══════════════════════════════════════════════════════════════════

    data = None
    blocked = False

    # ── TIER 1: Self-hosted Browserless (free)
    if BROWSERLESS_WS_URL and BROWSERLESS_TOKEN:
        log.info(f"🏠 [TIER 1 · SELF-HOSTED] {task[:80]}...")
        data = await run_agent(task, req.max_steps, use_cloud=False)

        if data["success"] and is_blocked(data.get("result", "")):
            log.info("🛡️  Anti-bot block detected — escalating to Tier 2")
            blocked = True
        elif data["success"]:
            log.info("✅ Tier 1 succeeded")
        else:
            log.info(f"❌ Tier 1 failed: {data.get('error', 'unknown')}")

    # ── TIER 2: Browser Use Cloud (paid, anti-detect)
    if BROWSER_USE_API_KEY and (blocked or (data and not data["success"]) or not data):
        tier2_reason = "blocked" if blocked else ("failed" if data else "no self-hosted config")
        log.info(f"☁️  [TIER 2 · CLOUD] Reason: {tier2_reason}. {task[:80]}...")
        cloud_data = await run_agent(task, req.max_steps, use_cloud=True)

        if cloud_data["success"] and not is_blocked(cloud_data.get("result", "")):
            data = cloud_data
            used_cloud = True
            blocked = False
            log.info("✅ Tier 2 succeeded")
        else:
            if cloud_data["success"]:
                log.warning("🛡️  Even cloud browser got blocked — escalating to Tier 3")
                blocked = True
            else:
                log.warning(f"❌ Tier 2 failed: {cloud_data.get('error', 'unknown')}")

    # ── TIER 3: BLOOM Desktop (real browser on user's machine)
    if blocked or (data and not data.get("success")):
        desktop_available = await check_desktop_available()
        if desktop_available:
            log.info(f"🖥️  [TIER 3 · DESKTOP] Using real browser via BLOOM Desktop...")
            desktop_data = await run_via_desktop(task, req.url)
            if desktop_data.get("success"):
                data = desktop_data
                used_desktop = True
                blocked = False
                log.info("✅ Tier 3 succeeded (BLOOM Desktop)")
            else:
                log.warning(f"❌ Tier 3 failed: {desktop_data.get('error', 'unknown')}")
        else:
            if blocked:
                log.warning("⚠️  All browser tiers exhausted. No BLOOM Desktop connected.")

    # ── NO BROWSERS AT ALL
    if not data:
        return BrowseResponse(
            success=False,
            error="No browser configured. Set BROWSERLESS_WS_URL + BROWSERLESS_TOKEN for self-hosted, "
                  "or BROWSER_USE_API_KEY for cloud, or connect a BLOOM Desktop app."
        )

    # ── STEP 2: Push screenshot to dashboard
    if data.get("screenshot_base64"):
        await push_screenshot(data["screenshot_base64"], data.get("url_final"))

    elapsed = int((asyncio.get_event_loop().time() - start) * 1000)

    # Determine which tier ultimately served the request
    tier_used = "desktop" if used_desktop else ("cloud" if used_cloud else "self-hosted")

    return BrowseResponse(
        success=data.get("success", False),
        result=data.get("result"),
        error=data.get("error"),
        steps_taken=data.get("steps_taken", 0),
        duration_ms=elapsed,
        url_final=data.get("url_final"),
        screenshot_base64=data.get("screenshot_base64"),
        used_cloud=used_cloud,
        used_desktop=used_desktop,
        tier_used=tier_used,
    )


# ═══════════════════════════════════════════════════════════════════════════
# /screenshot — Quick screenshot using same fallback pattern
# ═══════════════════════════════════════════════════════════════════════════

@app.post("/screenshot", response_model=ScreenshotResponse)
async def screenshot(req: ScreenshotRequest):
    check_auth(req.secret)
    task = f"Navigate to {req.url} and describe what you see on the page."

    # Try self-hosted first
    data = None
    if BROWSERLESS_WS_URL and BROWSERLESS_TOKEN:
        data = await run_agent(task, max_steps=5, use_cloud=False)
        if data["success"] and is_blocked(data.get("result", "")) and BROWSER_USE_API_KEY:
            data = await run_agent(task, max_steps=5, use_cloud=True)
    elif BROWSER_USE_API_KEY:
        data = await run_agent(task, max_steps=5, use_cloud=True)

    if not data:
        return ScreenshotResponse(success=False, error="No browser configured")

    ss = data.get("screenshot_base64")
    if ss:
        await push_screenshot(ss, req.url)
        return ScreenshotResponse(success=True, screenshot_base64=ss)
    return ScreenshotResponse(success=False, error=data.get("error", "No screenshot captured"))


# ═══════════════════════════════════════════════════════════════════════════
# /health
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    desktop_connected = await check_desktop_available()
    return {
        "status": "healthy",
        "service": "bloom-browser-agent",
        "version": "3.0.0",
        "tiers": {
            "tier1_self_hosted": bool(BROWSERLESS_WS_URL and BROWSERLESS_TOKEN),
            "tier2_cloud": bool(BROWSER_USE_API_KEY),
            "tier3_desktop": desktop_connected,
        },
        "model": ANTHROPIC_MODEL,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


# ── Run
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
