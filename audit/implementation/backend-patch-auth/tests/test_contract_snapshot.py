"""Day 6: OpenAPI/schema snapshot test — the committed contract must match the app.

Catches accidental breaking changes: if a route or schema is added/renamed
without regenerating `contract/` (scripts/export_contract.py), this fails.
Additive changes are fine — just regen the snapshot in the same commit.
"""
from __future__ import annotations

import json
import os

from fastapi.testclient import TestClient

from app.main import app

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _contract(name: str) -> dict:
    with open(os.path.join(ROOT, "contract", name), encoding="utf-8") as f:
        return json.load(f)


def test_openapi_snapshot_matches_live_app():
    live = TestClient(app, headers={"X-Quantplus-Key": "offline-internal-test-key"}).get("/openapi.json").json()
    snap = _contract("openapi.json")
    live_paths = {p: sorted(ops) for p, ops in live["paths"].items()}
    snap_paths = {p: sorted(ops) for p, ops in snap["paths"].items()}
    assert live_paths == snap_paths, (
        "OpenAPI drift vs contract/openapi.json — run scripts/export_contract.py")


def test_schema_snapshot_matches_live_models():
    import app.schemas as S
    from pydantic import BaseModel
    live = {n for n, c in vars(S).items()
            if isinstance(c, type) and issubclass(c, BaseModel) and c is not BaseModel}
    snap = set(_contract("schemas.json"))
    assert live == snap, f"schema drift: live-only={live - snap} snapshot-only={snap - live}"
