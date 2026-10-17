"""Event clustering for syndicated news.

Near-identical reports of one development form a cluster. The earliest known
report represents it (later copies never become independent signals); the
cluster records every member, source and the latest update for lineage.
Different numbers or directions always form different clusters.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from difflib import SequenceMatcher

from ..config import config

DIRECTIONS = r"\b(?:rises?|falls?|gains?|drops?|cuts?|raises?|up|down|beats?|misses?)\b"


def normalized(title, source=""):
    title = unicodedata.normalize("NFKC", title).lower().removesuffix(" - " + source.lower())
    return " ".join(re.findall(r"[a-z0-9]+", title))


def same_development(a: str, b: str, threshold: float) -> bool:
    if a == b:
        return True
    if re.findall(r"\d+(?:\.\d+)?", a) != re.findall(r"\d+(?:\.\d+)?", b):
        return False
    if set(re.findall(DIRECTIONS, a)) != set(re.findall(DIRECTIONS, b)):
        return False
    return SequenceMatcher(None, a, b, autojunk=False).ratio() > threshold


def cluster(articles, threshold=None):
    threshold = config.duplicate_threshold if threshold is None else threshold
    clusters: list[dict] = []
    for article in sorted(articles, key=lambda a: (a["published_at"], a["id"])):
        headline = normalized(article["title"], article["source"])
        home = next((c for c in clusters if article["id"] in c["ids"] or
                     same_development(headline, c["headline"], threshold)), None)
        if home is None:
            clusters.append({"headline": headline, "ids": {article["id"]}, "members": [article]})
        else:
            home["ids"].add(article["id"])
            if all(m["id"] != article["id"] for m in home["members"]):
                home["members"].append(article)
    return clusters


def deduplicate(articles, threshold=None):
    """One representative per development: the earliest known report, with lineage."""
    representatives = []
    for group in cluster(articles, threshold):
        members = group["members"]
        earliest = members[0]
        cluster_id = hashlib.sha256("|".join(sorted(group["ids"])).encode()).hexdigest()[:16]
        representatives.append({
            **earliest,
            "cluster": {
                "id": cluster_id,
                "size": len(members),
                "sources": sorted({m["source"] for m in members}),
                "member_ids": [m["id"] for m in members],
                "first_published_at": earliest["published_at"],
                "latest_published_at": members[-1]["published_at"],
            },
        })
    return sorted(representatives, key=lambda a: a["published_at"], reverse=True)
