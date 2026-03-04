"""
BLOOM Browser Agent v2 — browser-use sidecar for Sarah Rodriguez

Smart fallback pattern (inspired by Crawl4AI's Anti-Bot & Fallback):
1. Try self-hosted Browserless first (free)
2. Detect Cloudflare/anti-bot blocks using structural HTML markers
3. Auto-retry with Browser Use Cloud (paid, anti-detect)
4. Push screenshots to dashboard Screen Viewer

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

# These are exact phrases from real Cloudflare/anti-bot block pages
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

def is_blocked(text: str) -> bool:
    """Detect if page content shows anti-bot blocking.
    Uses structural markers per Crawl4AI pattern to avoid false positives."""
    if not text:
        return False
    lower = text.lower()
    # Need at least 2 signatures to confirm (reduces false positives)
    matches = sum(1 for sig in BLOCK_SIGNATURES if sig in lower)
    return matches >= 2


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

app = FastAPI(title="BLOOM Browser Agent", version="2.1.0", lifespan=lifespan)


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

    # ── STEP 1: Try self-hosted Browserless (free)
    if BROWSERLESS_WS_URL and BROWSERLESS_TOKEN:
        log.info(f"🏠 [SELF-HOSTED] {task[:80]}...")
        data = await run_agent(task, req.max_steps, use_cloud=False)

        # Check: did it succeed but land on a block page?
        if data["success"] and is_blocked(data.get("result", "")):
            log.info("🛡️  Anti-bot block detected in self-hosted result")

            if BROWSER_USE_API_KEY:
                log.info("☁️  Retrying with Browser Use Cloud...")
                cloud_data = await run_agent(task, req.max_steps, use_cloud=True)
                if cloud_data["success"]:
                    data = cloud_data
                    used_cloud = True
                    log.info("✅ Cloud fallback succeeded")
                else:
                    log.warning(f"☁️  Cloud fallback also failed: {cloud_data.get('error')}")
            else:
                log.warning("⚠️  No BROWSER_USE_API_KEY — can't fall back to cloud")

        # Check: did self-hosted fail entirely (connection error, crash)?
        elif not data["success"] and BROWSER_USE_API_KEY:
            log.info(f"🏠 Self-hosted failed ({data.get('error', 'unknown')}), trying cloud...")
            cloud_data = await run_agent(task, req.max_steps, use_cloud=True)
            if cloud_data["success"]:
                data = cloud_data
                used_cloud = True
                log.info("✅ Cloud fallback succeeded")

    # ── STEP 1b: No self-hosted config → go straight to cloud
    elif BROWSER_USE_API_KEY:
        log.info(f"☁️  [CLOUD-ONLY] No self-hosted config, using cloud: {task[:80]}...")
        data = await run_agent(task, req.max_steps, use_cloud=True)
        used_cloud = True

    else:
        return BrowseResponse(success=False, error="No browser configured (need BROWSERLESS_WS_URL or BROWSER_USE_API_KEY)")

    # ── STEP 2: Push screenshot to dashboard
    if data.get("screenshot_base64"):
        await push_screenshot(data["screenshot_base64"], data.get("url_final"))

    elapsed = int((asyncio.get_event_loop().time() - start) * 1000)

    return BrowseResponse(
        success=data.get("success", False),
        result=data.get("result"),
        error=data.get("error"),
        steps_taken=data.get("steps_taken", 0),
        duration_ms=elapsed,
        url_final=data.get("url_final"),
        screenshot_base64=data.get("screenshot_base64"),
        used_cloud=used_cloud,
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
    return {
        "status": "healthy",
        "service": "bloom-browser-agent",
        "version": "2.1.0",
        "self_hosted": bool(BROWSERLESS_WS_URL and BROWSERLESS_TOKEN),
        "cloud_fallback": bool(BROWSER_USE_API_KEY),
        "model": ANTHROPIC_MODEL,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


# ── Run
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
