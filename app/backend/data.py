"""Loads the listings the alert agent publishes every 15 minutes (data branch of the repo)."""
from __future__ import annotations

import json
import logging
import os
import threading
import time

import httpx

log = logging.getLogger("data")
DATA_URL = os.getenv("DATA_URL", "https://raw.githubusercontent.com/Raghavnv/Internship-Agent/data/jobs.json")
DATA_FILE = os.getenv("DATA_FILE")  # local override for development / tests
REFRESH_SECONDS = int(os.getenv("DATA_REFRESH_SECONDS", "300"))


class Store:
    def __init__(self):
        self.jobs: list[dict] = []
        self.updated = 0
        self.openings: dict = {}
        self.loaded_at = 0.0
        self._lock = threading.Lock()

    def _load(self):
        if DATA_FILE:
            with open(DATA_FILE, encoding="utf-8") as f:
                payload = json.load(f)
        else:
            # cache-buster: raw.githubusercontent.com caches files for a few minutes
            r = httpx.get(DATA_URL, params={"t": int(time.time() // 60)}, timeout=30, follow_redirects=True)
            r.raise_for_status()
            payload = r.json()
        self.jobs = payload.get("jobs", [])
        self.updated = payload.get("updated", 0)
        self.openings = self._load_openings()
        self.loaded_at = time.time()
        log.info("loaded %d listings (data updated %s)", len(self.jobs), self.updated)

    def _load_openings(self):
        """openings.json sits next to jobs.json; it's optional (older data branches don't have it)."""
        try:
            if DATA_FILE:
                path = os.path.join(os.path.dirname(DATA_FILE), "openings.json")
                if not os.path.exists(path):
                    return self.openings
                with open(path, encoding="utf-8") as f:
                    return json.load(f)
            r = httpx.get(DATA_URL.rsplit("/", 1)[0] + "/openings.json", params={"t": int(time.time() // 60)},
                          timeout=30, follow_redirects=True)
            return r.json() if r.status_code == 200 else self.openings
        except Exception as e:
            log.warning("openings not loaded: %s", e)
            return self.openings

    def refresh(self, min_age=45):
        """Reload now (someone pressed Refresh), unless we loaded very recently. Keeps the old copy on failure."""
        if time.time() - self.loaded_at < min_age or not self._lock.acquire(timeout=20):
            return False
        try:
            self._load()
            return True
        except Exception as e:
            log.warning("manual refresh failed: %s", e)
            return False
        finally:
            self._lock.release()

    def get(self):
        """Returns the listings, refreshing in the background when they're stale."""
        if not self.jobs:
            with self._lock:
                if not self.jobs:
                    self._load()
        elif time.time() - self.loaded_at > REFRESH_SECONDS and self._lock.acquire(blocking=False):
            def bg():
                try:
                    self._load()
                except Exception as e:  # keep serving the old copy
                    log.warning("refresh failed: %s", e)
                    self.loaded_at = time.time()
                finally:
                    self._lock.release()
            threading.Thread(target=bg, daemon=True).start()
        return self.jobs


store = Store()
