"""Start a fresh listings check on GitHub Actions when someone presses Refresh (or a timer pings us).

GitHub's own schedule only runs every hour or few, so the app asks for a run itself. Needs
GITHUB_TOKEN: a fine-grained token with "Actions: read and write" on the repo. Runs are spaced at
least MIN_GAP seconds apart however many people press Refresh.
"""
from __future__ import annotations

import logging
import os
import threading
import time

import httpx

log = logging.getLogger("collector")
TOKEN = os.getenv("GITHUB_TOKEN", "")
REPO = os.getenv("GITHUB_REPO", "Raghavnv/Internship-Agent")
WORKFLOW = os.getenv("GITHUB_WORKFLOW", "alerts.yml")
MIN_GAP = int(os.getenv("COLLECT_MIN_GAP_SECONDS", "600"))
API = os.getenv("GITHUB_API_URL", "https://api.github.com")

_lock = threading.Lock()
_state = {"dispatched": 0.0, "run": None, "checked": 0.0}


def configured() -> bool:
    return bool(TOKEN)


def _headers():
    return {"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}


def _latest_run():
    """Status of the newest run of the workflow ('queued', 'in_progress', 'completed'), cached 15 s."""
    now = time.time()
    if now - _state["checked"] < 15:
        return _state["run"]
    _state["checked"] = now
    try:
        r = httpx.get(f"{API}/repos/{REPO}/actions/workflows/{WORKFLOW}/runs", params={"per_page": 1},
                      headers=_headers(), timeout=8)
        r.raise_for_status()
        runs = r.json().get("workflow_runs") or []
        _state["run"] = {"status": runs[0]["status"], "created": runs[0]["created_at"]} if runs else None
    except (httpx.HTTPError, ValueError, KeyError) as e:
        log.info("couldn't read workflow runs: %s", e)
    return _state["run"]


def running() -> bool:
    if not configured():
        return False
    run = _latest_run()
    return bool(run and run["status"] in ("queued", "in_progress", "waiting", "requested", "pending"))


def kick(reason: str = "refresh") -> dict:
    """Ask GitHub for a run unless one is going or one started recently.

    Returns {"configured", "started", "running", "wait"}: wait = seconds until another may start.
    """
    if not configured():
        return {"configured": False, "started": False, "running": False, "wait": 0}
    with _lock:
        now = time.time()
        gap = now - _state["dispatched"]
        busy = running()
        if busy or gap < MIN_GAP:
            return {"configured": True, "started": False, "running": busy or gap < 240,
                    "wait": max(0, int(MIN_GAP - gap))}
        try:
            r = httpx.post(f"{API}/repos/{REPO}/actions/workflows/{WORKFLOW}/dispatches",
                           json={"ref": "main", "inputs": {"mode": "run"}}, headers=_headers(), timeout=10)
            r.raise_for_status()
        except httpx.HTTPError as e:
            log.warning("couldn't start a listings check (%s): %s", reason, e)
            return {"configured": True, "started": False, "running": False, "wait": 60, "error": True}
        _state["dispatched"] = now
        _state["checked"] = 0.0
        log.info("started a listings check (%s)", reason)
        return {"configured": True, "started": True, "running": True, "wait": MIN_GAP}


def since_dispatch() -> float:
    return time.time() - _state["dispatched"] if _state["dispatched"] else 1e9
