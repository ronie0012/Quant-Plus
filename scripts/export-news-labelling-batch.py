"""Export archived news items as a blank labelling batch (no labels are generated).

Usage: python scripts/export-news-labelling-batch.py <news-archive.sqlite3> <out.csv> [--limit N]
The CSV keeps cluster/issuer/time columns so grouped, time-separated splits remain possible.
Label columns are left empty for human reviewers following
audit/implementation/labelling/GUIDELINES.md.
"""
import argparse
import csv
import json
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument("archive")
parser.add_argument("output")
parser.add_argument("--limit", type=int, default=1000)
args = parser.parse_args()
with sqlite3.connect(args.archive) as db:
    rows = db.execute(
        "SELECT content_hash, story_key, version, provider, published_at, first_seen_at, raw"
        " FROM news_items ORDER BY first_seen_at LIMIT ?", (args.limit,)).fetchall()
with open(args.output, "x", newline="", encoding="utf-8") as handle:
    writer = csv.writer(handle)
    writer.writerow(["item_id", "story_key", "version", "provider", "published_at", "first_seen_at",
                     "issuer_query", "cluster_hint", "title", "snippet", "language",
                     "label_relevance", "label_entity", "label_tone", "label_event_type",
                     "label_certainty", "reviewer", "notes"])
    for content_hash, story, version, provider, published, first_seen, raw in rows:
        article = json.loads(raw)
        writer.writerow([content_hash, story, version, provider, published, first_seen,
                         article.get("symbol", ""), (article.get("cluster") or {}).get("id", ""),
                         article.get("title", ""), article.get("snippet", ""), article.get("language", ""),
                         "", "", "", "", "", "", ""])
print(f"Exported {len(rows)} unlabelled items to {args.output}")
