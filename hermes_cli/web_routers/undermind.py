"""``/api/undermind/*``: read-only pass-through to the local Undermind proxy.

Undermind — the subconscious bridge (offered memory, self-mirror, doctor
census, adversary notes) — serves plain HTTP on ``127.0.0.1:11435`` with no
CORS headers, so the renderer cannot fetch it directly. These routes proxy it
through the dashboard backend instead, which also keeps the Subconscious page
working when this gateway is the remote end of a desktop connection.

Everything here fails open: a stopped subconscious answers
``{"reachable": false}`` with HTTP 200, never a 5xx. The wrapper must survive
Undermind being down — that state is itself information the page renders.

Sync ``def`` on purpose: blocking ``urlopen`` runs in FastAPI's threadpool.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

from fastapi import APIRouter

router = APIRouter()

DEFAULT_PROXY_URL = "http://127.0.0.1:11435"
# Subconscious reads are interactive but must never hold the UI: the proxy
# answers these from SQLite/memory, so a second means "wedged", not "busy".
PROXY_TIMEOUT_S = 2.0


def _proxy_url() -> str:
    return os.environ.get("UNDERMIND_PROXY_URL", DEFAULT_PROXY_URL).rstrip("/")


def _get(path: str, query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """GET ``path`` on the proxy; always returns a JSON-safe dict."""
    url = _proxy_url() + path
    if query:
        filtered = {k: v for k, v in query.items() if v is not None}
        if filtered:
            url += "?" + urllib.parse.urlencode(filtered)
    try:
        with urllib.request.urlopen(url, timeout=PROXY_TIMEOUT_S) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError) as exc:
        return {"reachable": False, "error": str(exc)}
    if not isinstance(payload, dict):
        return {"reachable": False, "error": "unexpected payload"}
    return {"reachable": True, **payload}


@router.get("/api/undermind/health")
def undermind_health() -> Dict[str, Any]:
    """Counts, daydream scheduler state, serving mix and adversary tally."""
    return _get("/api/health")


@router.get("/api/undermind/doctor")
def undermind_doctor() -> Dict[str, Any]:
    """Last persisted 5-pipeline census plus recent DEAD/RECOVERED alerts."""
    return _get("/api/doctor")


@router.get("/api/undermind/intents")
def undermind_intents(min_count: int = 2, limit: int = 10) -> Dict[str, Any]:
    """Repeated human directions — the offered-memory block the model sees."""
    return _get("/api/intents", {"min_count": min_count, "limit": limit})


@router.get("/api/undermind/self-intents")
def undermind_self_intents(min_count: int = 2) -> Dict[str, Any]:
    """The self-mirror: themes mined from the assistant's own replies."""
    return _get("/api/self-intents", {"min_count": min_count})


@router.get("/api/undermind/echoes")
def undermind_echoes(q: str = "", limit: int = 3) -> Dict[str, Any]:
    """Memetic echoes — past reflections retrieved by meaning-similarity."""
    return _get("/api/echoes", {"q": q, "limit": limit})


@router.get("/api/undermind/adversary-notes")
def undermind_adversary_notes() -> Dict[str, Any]:
    """Recent flaws the watch-only critic flagged (shadow mode, never edits)."""
    return _get("/api/adversary-notes")
