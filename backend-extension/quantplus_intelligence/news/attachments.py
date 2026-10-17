"""Official announcement attachments: bounded retrieval, immutable bytes and isolated parsing."""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sqlite3
import sys
import tempfile
from urllib.parse import urlsplit

import httpx

from ..common import utcnow

MAX_BYTES = 6 * 1024 * 1024
ALLOWED_HOSTS = frozenset({"nsearchives.nseindia.com", "archives.nseindia.com", "www.nseindia.com",
                           "www.nse.in", "nsearchives.nse.in", "www.bseindia.com", "corporate.bseindia.com"})


def allowed_url(url):
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.hostname in ALLOWED_HOSTS and
            parsed.port in {None, 443} and not parsed.username and not parsed.password and not parsed.fragment)


def parse_isolated(raw, timeout=8):
    if len(raw) > MAX_BYTES:
        return {"status": "unavailable", "reason": "Attachment size limit exceeded"}
    environment = {key: value for key, value in os.environ.items() if key.upper() in
                   {"PATH", "SYSTEMROOT", "WINDIR", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PYTHONUSERBASE"}}
    with tempfile.TemporaryDirectory(prefix="qp-filing-") as directory:
        path = Path(directory) / "document"
        path.write_bytes(raw)
        try:
            result = subprocess.run([sys.executable, "-B", str(Path(__file__).with_name("attachment_worker.py")), str(path)],
                                    capture_output=True, timeout=timeout, env=environment, cwd=directory)
            output = json.loads(result.stdout)
            return output if isinstance(output, dict) else {"status": "unavailable", "reason": "Invalid parser output"}
        except subprocess.TimeoutExpired:
            return {"status": "unavailable", "reason": "Attachment parser timed out"}
        except (ValueError, OSError):
            return {"status": "unavailable", "reason": "Attachment parser failed"}


class AttachmentIngestor:
    def __init__(self, archive, transport=None):
        self.archive = archive
        self.transport = transport
        self.slots = asyncio.Semaphore(2)

    async def ingest(self, article):
        url = article.get("attachment_url")
        if article.get("provider") != "nse_announcements" or not isinstance(url, str):
            return {"status": "unavailable", "reason": "No official attachment"}
        try:
            if not allowed_url(url):
                return {"status": "unavailable", "reason": "Attachment host is not allowed"}
            previous = await asyncio.to_thread(self.archive.latest_attachment, url)
            headers = {"User-Agent": "QuantPlus-FilingReader/1.0", "Accept-Encoding": "identity"}
            if previous and previous.get("etag"):
                headers["If-None-Match"] = previous["etag"]
            if previous and previous.get("last_modified"):
                headers["If-Modified-Since"] = previous["last_modified"]
            async with self.slots:
                async with httpx.AsyncClient(timeout=8, follow_redirects=False, trust_env=False, transport=self.transport) as client:
                    async with client.stream("GET", url, headers=headers) as response:
                        if response.status_code == 304 and previous:
                            return {**previous["parsed"], "content_hash": previous["content_hash"], "available_at": previous["observed_at"], "retrieval": "not_modified"}
                        response.raise_for_status()
                        if response.status_code != 200:
                            raise ValueError("Attachment redirect or unexpected response")
                        if int(response.headers.get("content-length", "0")) > MAX_BYTES:
                            raise ValueError("Attachment size limit exceeded")
                        chunks, size = [], 0
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > MAX_BYTES:
                                raise ValueError("Attachment size limit exceeded")
                            chunks.append(chunk)
                        raw = b"".join(chunks)
                        etag = response.headers.get("etag")
                        modified = response.headers.get("last-modified")
                parsed = await asyncio.to_thread(parse_isolated, raw)
                digest = hashlib.sha256(raw).hexdigest()
                observed = utcnow().isoformat()
                await asyncio.to_thread(self.archive.record_attachment, url, digest, raw, parsed, observed, etag, modified)
                return {**parsed, "content_hash": digest, "available_at": observed, "retrieval": "downloaded"}
        except (httpx.HTTPError, ValueError, OSError, sqlite3.Error):
            return {"status": "unavailable", "reason": "Official attachment could not be retrieved or parsed"}
