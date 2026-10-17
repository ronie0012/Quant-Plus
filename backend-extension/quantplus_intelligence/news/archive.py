"""Durable raw news evidence archive (SQLite, append-only).

Every observed item is stored with a content hash, provider, canonical link and
its first observation time. A later observation of the same story with
different content is stored as a new version that names the version it
supersedes; history is never rewritten.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
from pathlib import Path

from ..common import utcnow

# Scope fingerprints to the provider's story identity. Distinct source records
# can carry identical text/URLs and must retain independent version lineages.
CONTENT_FIELDS = ("provider", "id", "title", "snippet", "published_at", "source", "url", "attachment_url")


def content_hash(article: dict) -> str:
    payload = json.dumps({k: article.get(k) for k in CONTENT_FIELDS}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def story_key(article: dict) -> str:
    return hashlib.sha256(f"{article.get('provider')}|{article.get('id')}".encode()).hexdigest()


class NewsArchive:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS news_items ("
                " content_hash TEXT PRIMARY KEY, story_key TEXT NOT NULL, version INTEGER NOT NULL,"
                " supersedes TEXT, provider TEXT NOT NULL, article_id TEXT NOT NULL,"
                " published_at TEXT, first_seen_at TEXT NOT NULL, raw TEXT NOT NULL,"
                " UNIQUE (story_key, version))")
            db.execute(
                "CREATE TRIGGER IF NOT EXISTS news_items_append_only BEFORE UPDATE ON news_items"
                " BEGIN SELECT RAISE(ABORT, 'news archive is append-only'); END")
            db.execute(
                "CREATE TRIGGER IF NOT EXISTS news_items_no_delete BEFORE DELETE ON news_items"
                " BEGIN SELECT RAISE(ABORT, 'news archive is append-only'); END")
            db.execute("CREATE TABLE IF NOT EXISTS news_attachments ("
                       "url TEXT NOT NULL, content_hash TEXT NOT NULL, raw BLOB NOT NULL, parsed TEXT NOT NULL,"
                       "observed_at TEXT NOT NULL, etag TEXT, last_modified TEXT, PRIMARY KEY (url, content_hash))")
            for operation in ("UPDATE", "DELETE"):
                db.execute(f"CREATE TRIGGER IF NOT EXISTS news_attachments_no_{operation.lower()} BEFORE {operation} ON news_attachments"
                           " BEGIN SELECT RAISE(ABORT, 'attachment archive is append-only'); END")

    def _connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=FULL")
        return db

    def _record(self, articles: list[dict], observed_at: str) -> list[dict]:
        annotated = []
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            for article in articles:
                digest = content_hash(article)
                key = story_key(article)
                existing = db.execute(
                    "SELECT version, first_seen_at FROM news_items WHERE content_hash = ?", (digest,)).fetchone()
                if existing:
                    version, first_seen = existing
                else:
                    latest = db.execute(
                        "SELECT version, content_hash FROM news_items WHERE story_key = ?"
                        " ORDER BY version DESC LIMIT 1", (key,)).fetchone()
                    version = (latest[0] + 1) if latest else 1
                    first_seen = observed_at
                    db.execute(
                        "INSERT INTO news_items (content_hash, story_key, version, supersedes, provider,"
                        " article_id, published_at, first_seen_at, raw) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (digest, key, version, latest[1] if latest else None, str(article.get("provider")),
                         str(article.get("id")), article.get("published_at"), observed_at,
                         json.dumps(article, default=str)))
                story_first_seen = db.execute(
                    "SELECT MIN(first_seen_at) FROM news_items WHERE story_key = ?", (key,)).fetchone()[0]
                annotated.append({**article, "content_hash": digest, "version": version,
                                  "first_seen_at": story_first_seen or first_seen,
                                  "version_first_seen_at": first_seen})
        return annotated

    async def record(self, articles: list[dict], observed_at: str | None = None) -> list[dict]:
        return await asyncio.to_thread(self._record, articles, observed_at or utcnow().isoformat())

    def versions(self, article: dict) -> list[dict]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT version, content_hash, supersedes, first_seen_at FROM news_items"
                " WHERE story_key = ? ORDER BY version", (story_key(article),)).fetchall()
        return [{"version": v, "content_hash": h, "supersedes": s, "first_seen_at": f} for v, h, s, f in rows]

    def latest_attachment(self, url):
        with self._connect() as db:
            row = db.execute("SELECT content_hash, parsed, observed_at, etag, last_modified FROM news_attachments WHERE url=? ORDER BY observed_at DESC LIMIT 1", (url,)).fetchone()
        return dict(zip(("content_hash", "parsed", "observed_at", "etag", "last_modified"),
                        (row[0], json.loads(row[1]), *row[2:]))) if row else None

    def record_attachment(self, url, digest, raw, parsed, observed_at, etag, last_modified):
        with self._connect() as db:
            db.execute("INSERT OR IGNORE INTO news_attachments VALUES (?, ?, ?, ?, ?, ?, ?)",
                       (url, digest, raw, json.dumps(parsed), observed_at, etag, last_modified))
