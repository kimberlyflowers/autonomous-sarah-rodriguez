"""
BLOOM Browser Agent — browser-use sidecar for Sarah Rodriguez
Connects to Browserless (Railway) for managed Chrome, uses browser-use for AI-driven interactions.
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
BROWSERLESS_WS_URL = os.getenv("BROWSERLESS_WS_URL", "")  # ws://browserless.railway.internal:3000
BROWSERLESS_TOKEN = os.getenv("BROWSERLESS_TOKEN", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
SIDECAR_SECRET = os.getenv("SIDECAR_SECRET", "")  # shared secret for Sarah → sidecar auth
SARAH_BASE_URL = os.getenv("SARAH_BASE_URL", "http://autonomous-sarah-rodriguez.railway.internal:3000")  # internal URL for screenshot push
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
    version="1.0.0",
    lifespan=lifespan,
)


# ── Models
class BrowseRequest(BaseModel):
    task: str = Field(..., description="Natural language task for the browser agent")
    url: Optional[str] = Field(None, description="Starting URL (optional — agent can navigate itself)")
    max_steps: int = Field(25, description="Maximum agent steps before stopping", ge=1, le=100)
    secret: Optional[str] = Field(None, description="Shared secret for authentication")


class BrowseResponse(BaseModel):
    success: bool
    result: Optional[str] = None
    error: Optional[str] = None
    steps_taken: int = 0
    duration_ms: int = 0
    url_final: Optional[str] = None


class ScreenshotRequest(BaseModel):
    url: str = Field(..., description="URL to screenshot")
    secret: Optional[str] = None


class ScreenshotResponse(BaseModel):
    success: bool
    screenshot_base64: Optional[str] = None
    error: Optional[str] = None


# ── Auth helper
def check_auth(secret: Optional[str]):
    if SIDECAR_SECRET and secret != SIDECAR_SECRET:
        raise HTTPException(status_code=401, detail="Invalid or missing sidecar secret")


# ── Build browser session connected to Browserless
def build_cdp_url() -> str:
    base = BROWSERLESS_WS_URL.rstrip("/")
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}token={BROWSERLESS_TOKEN}"


# ── Push screenshot to Sarah's dashboard in real-time
async def push_screenshot_to_dashboard(screenshot_b64: str, url: str = None):
    """POST a screenshot to Sarah's main server for the Screen Viewer SSE stream."""
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


# ── Step callback — streams screenshots to dashboard during browsing
def make_step_callback():
    """Create a step callback that pushes screenshots after each agent step."""
    def step_callback(state, model_output, step_number):
        if state and hasattr(state, 'screenshot') and state.screenshot:
            url = state.url if hasattr(state, 'url') else None
            # Fire-and-forget async push
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(push_screenshot_to_dashboard(state.screenshot, url))
                else:
                    asyncio.run(push_screenshot_to_dashboard(state.screenshot, url))
            except Exception:
                pass
    return step_callback


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
    """
    Execute an AI-driven browser task.
    The agent connects to Browserless, navigates, clicks, fills forms, and returns results.
    """
    check_auth(req.secret)

    if not BROWSERLESS_WS_URL or not BROWSERLESS_TOKEN or not ANTHROPIC_API_KEY:
        return BrowseResponse(success=False, error="Sidecar not fully configured — missing env vars")

    start = asyncio.get_event_loop().time()

    try:
        # Build task with optional starting URL
        task = req.task
        if req.url:
            task = f"Navigate to {req.url}. Then: {task}"

        # Connect to Browserless via CDP
        cdp_url = build_cdp_url()
        log.info(f"Starting browser task: {task[:100]}...")

        browser_session = Browser(cdp_url=cdp_url)

        # Use Claude as the LLM
        llm = ChatAnthropic(
            model=ANTHROPIC_MODEL,
            api_key=ANTHROPIC_API_KEY,
            temperature=0,
        )

        # Create and run agent with step callback for live Screen Viewer
        agent = Agent(
            task=task,
            llm=llm,
            browser=browser_session,
            max_failures=3,
        )
        agent.register_new_step_callback(make_step_callback())

        result = await agent.run(max_steps=req.max_steps)

        elapsed = int((asyncio.get_event_loop().time() - start) * 1000)

        # Extract final result
        final_text = ""
        if result and hasattr(result, "final_result"):
            final_text = str(result.final_result()) if callable(result.final_result) else str(result.final_result)
        elif result:
            final_text = str(result)

        # Try to get the final URL
        final_url = None
        try:
            if browser_session.browser and browser_session.browser.contexts:
                pages = browser_session.browser.contexts[0].pages
                if pages:
                    final_url = pages[-1].url
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

        log.info(f"Task completed in {elapsed}ms, {steps} steps")

        return BrowseResponse(
            success=True,
            result=final_text,
            steps_taken=steps,
            duration_ms=elapsed,
            url_final=final_url,
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
        # Disconnect CDP but DON'T close pages — the dashboard's BrowserService
        # streams screenshots from Browserless and needs the pages to stay alive
        # so the user can see what Sarah browsed
        try:
            if browser_session and hasattr(browser_session, 'browser') and browser_session.browser:
                # Just disconnect the CDP connection, pages persist in Browserless
                try:
                    await browser_session.browser.close()
                except Exception:
                    pass
        except Exception:
            pass


@app.post("/screenshot", response_model=ScreenshotResponse)
async def screenshot(req: ScreenshotRequest):
    """
    Take a screenshot of a URL via Browserless.
    Navigates to the URL, takes screenshot, and leaves page alive for Screen Viewer.
    """
    check_auth(req.secret)

    if not BROWSERLESS_WS_URL or not BROWSERLESS_TOKEN:
        return ScreenshotResponse(success=False, error="Browserless not configured")

    try:
        from playwright.async_api import async_playwright
        import base64

        cdp_url = build_cdp_url()

        async with async_playwright() as p:
            browser = await p.chromium.connect_over_cdp(cdp_url)

            # Try to find an existing page already on this URL
            target_page = None
            for ctx in browser.contexts:
                for page in ctx.pages:
                    try:
                        if page.url and req.url in page.url:
                            target_page = page
                            break
                    except Exception:
                        pass
                if target_page:
                    break

            if not target_page:
                # Open new page and navigate — leave it alive for Screen Viewer
                if browser.contexts:
                    target_page = await browser.contexts[0].new_page()
                else:
                    ctx = await browser.new_context(viewport={"width": 1280, "height": 720})
                    target_page = await ctx.new_page()
                await target_page.goto(req.url, wait_until="networkidle", timeout=30000)

            screenshot_bytes = await target_page.screenshot(type="png", full_page=False)
            # Disconnect CDP but DON'T close pages — Screen Viewer needs them
            await browser.close()

        b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
        return ScreenshotResponse(success=True, screenshot_base64=b64)

    except Exception as e:
        log.error(f"Screenshot failed: {e}", exc_info=True)
        return ScreenshotResponse(success=False, error=str(e))


# ── Run
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
