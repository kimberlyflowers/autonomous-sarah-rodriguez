"""
BLOOM Browser Agent — browser-use sidecar for Sarah Rodriguez
Connects to Browserless (Railway) for managed Chrome, uses browser-use for AI-driven interactions.

Based on official browser-use docs:
- https://docs.browser-use.com/customize/agent/all-parameters
- https://docs.browser-use.com/customize/browser/all-parameters
- https://docs.browser-use.com/customize/browser/remote
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
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("browser-agent")

# ── Config
BROWSERLESS_WS_URL = os.getenv("BROWSERLESS_WS_URL", "")
BROWSERLESS_TOKEN = os.getenv("BROWSERLESS_TOKEN", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
SIDECAR_SECRET = os.getenv("SIDECAR_SECRET", "")
SARAH_BASE_URL = os.getenv("SARAH_BASE_URL", "http://autonomous-sarah-rodriguez.railway.internal:3000")
PORT = int(os.getenv("PORT", "8080"))


# ── FastAPI app
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Browser Agent sidecar starting...")
    missing = []
    if not BROWSERLESS_WS_URL:
        missing.append("BROWSERLESS_WS_URL")
    if not BROWSERLESS_TOKEN:
        missing.append("BROWSERLESS_TOKEN")
    if not ANTHROPIC_API_KEY:
        missing.append("ANTHROPIC_API_KEY")
    if missing:
        log.warning(f"Missing env vars: {', '.join(missing)} — agent tasks will fail")
    else:
        log.info(f"Config OK — Browserless: {BROWSERLESS_WS_URL}, Model: {ANTHROPIC_MODEL}")
    yield
    log.info("Browser Agent sidecar shutting down.")


app = FastAPI(
    title="BLOOM Browser Agent",
    description="browser-use sidecar — AI-driven browser automation for Bloomie agents",
    version="2.0.0",
    lifespan=lifespan,
)


# ── Request/Response Models
class BrowseRequest(BaseModel):
    task: str = Field(..., description="Natural language task for the browser agent")
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


class ScreenshotRequest(BaseModel):
    url: str
    secret: Optional[str] = None


class ScreenshotResponse(BaseModel):
    success: bool
    screenshot_base64: Optional[str] = None
    error: Optional[str] = None


# ── Helpers
def check_auth(secret: Optional[str]):
    if SIDECAR_SECRET and secret != SIDECAR_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing sidecar secret")


def build_cdp_url() -> str:
    """Build Browserless CDP URL with token and stealth."""
    base = BROWSERLESS_WS_URL.rstrip("/")
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}token={BROWSERLESS_TOKEN}&stealth=true"


async def push_screenshot_to_dashboard(screenshot_b64: str, url: str = None):
    """POST screenshot to Sarah's main server for Screen Viewer SSE stream."""
    if not SARAH_BASE_URL:
        return
    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            await session.post(
                f"{SARAH_BASE_URL}/api/browser/push-screenshot",
                json={"data": screenshot_b64, "url": url or ""},
                timeout=aiohttp.ClientTimeout(total=5),
            )
    except Exception as e:
        log.debug(f"Screenshot push failed (non-critical): {e}")


# ── Endpoints
@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "bloom-browser-agent",
        "browserless_configured": bool(BROWSERLESS_WS_URL and BROWSERLESS_TOKEN),
        "anthropic_configured": bool(ANTHROPIC_API_KEY),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.post("/browse", response_model=BrowseResponse)
async def browse(req: BrowseRequest):
    """Execute an AI-driven browser task via browser-use Agent."""
    check_auth(req.secret)

    if not BROWSERLESS_WS_URL or not BROWSERLESS_TOKEN or not ANTHROPIC_API_KEY:
        return BrowseResponse(success=False, error="Sidecar not configured — missing env vars")

    start = asyncio.get_event_loop().time()
    browser_session = None

    try:
        # Build task — browser-use has directly_open_url=True by default
        # so if URL is in the task string, it auto-navigates
        task = req.task
        if req.url and req.url not in task:
            task = f"Navigate to {req.url}. Then: {task}"

        cdp_url = build_cdp_url()
        log.info(f"Starting browser task: {task[:120]}...")

        # Create Browser with CDP connection to Browserless
        # Per docs: Browser(cdp_url=...) for remote browser
        # headless=True since Railway has no display
        browser_session = Browser(
            cdp_url=cdp_url,
            headless=True,
        )

        # Use browser-use's native ChatAnthropic (not langchain's)
        llm = ChatAnthropic(
            model=ANTHROPIC_MODEL,
            api_key=ANTHROPIC_API_KEY,
            temperature=0,
        )

        # Create agent per official docs
        agent = Agent(
            task=task,
            llm=llm,
            browser=browser_session,
            max_failures=3,
            use_vision=True,
        )

        # Run the agent
        result = await agent.run(max_steps=req.max_steps)

        elapsed = int((asyncio.get_event_loop().time() - start) * 1000)

        # Extract final result — result is AgentHistoryList
        final_text = ""
        if result:
            try:
                fr = result.final_result()
                final_text = str(fr) if fr else ""
            except Exception:
                final_text = str(result)

        # Get final URL from history
        final_url = None
        try:
            urls = result.urls() if result else []
            if urls:
                final_url = urls[-1]
        except Exception:
            pass

        # Get steps taken
        steps = 0
        try:
            if hasattr(result, "n_steps"):
                steps = result.n_steps
            elif hasattr(result, "history") and result.history:
                steps = len(result.history)
        except Exception:
            pass

        # Get final screenshot and push to dashboard
        screenshot_b64 = None
        try:
            screenshots = result.screenshots() if result else []
            if screenshots:
                screenshot_b64 = screenshots[-1]
                await push_screenshot_to_dashboard(screenshot_b64, final_url)
        except Exception as e:
            log.debug(f"Screenshot extraction failed: {e}")

        log.info(f"Task completed in {elapsed}ms, {steps} steps, url={final_url}")

        return BrowseResponse(
            success=True,
            result=final_text,
            steps_taken=steps,
            duration_ms=elapsed,
            url_final=final_url,
            screenshot_base64=screenshot_b64,
        )

    except Exception as e:
        elapsed = int((asyncio.get_event_loop().time() - start) * 1000)
        log.error(f"Browser task failed: {e}", exc_info=True)
        return BrowseResponse(
            success=False,
            error=str(e),
            duration_ms=elapsed,
        )

    finally:
        # Close browser session properly per docs
        try:
            if browser_session:
                await browser_session.close()
        except Exception:
            pass


@app.post("/screenshot", response_model=ScreenshotResponse)
async def screenshot(req: ScreenshotRequest):
    """Take a screenshot using browser-use Agent for consistency."""
    check_auth(req.secret)

    if not BROWSERLESS_WS_URL or not BROWSERLESS_TOKEN:
        return ScreenshotResponse(success=False, error="Browserless not configured")

    browser_session = None
    try:
        cdp_url = build_cdp_url()

        browser_session = Browser(
            cdp_url=cdp_url,
            headless=True,
        )

        llm = ChatAnthropic(
            model=ANTHROPIC_MODEL,
            api_key=ANTHROPIC_API_KEY,
            temperature=0,
        )

        agent = Agent(
            task=f"Navigate to {req.url} and describe what you see on the page.",
            llm=llm,
            browser=browser_session,
            max_failures=2,
            use_vision=True,
        )

        result = await agent.run(max_steps=5)

        screenshot_b64 = None
        try:
            screenshots = result.screenshots() if result else []
            if screenshots:
                screenshot_b64 = screenshots[-1]
                await push_screenshot_to_dashboard(screenshot_b64, req.url)
        except Exception:
            pass

        if screenshot_b64:
            return ScreenshotResponse(success=True, screenshot_base64=screenshot_b64)
        else:
            return ScreenshotResponse(success=False, error="No screenshot captured")

    except Exception as e:
        log.error(f"Screenshot failed: {e}", exc_info=True)
        return ScreenshotResponse(success=False, error=str(e))

    finally:
        try:
            if browser_session:
                await browser_session.close()
        except Exception:
            pass


# ── Run
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
