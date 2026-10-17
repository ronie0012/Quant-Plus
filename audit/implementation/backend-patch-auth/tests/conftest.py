"""Hermetic test DB: point sqlite_conn() at a per-session temp file.

Without this, tests share data/quantplus.db with production (evo population
cap, usage_daily ledger), so real rows — e.g. the 8 forward-paper founders —
break tests that assume an empty store, and tests pollute production data.
QP_DB_PATH is consumed by app.db.sqlite_conn; production default is unchanged.
"""
from __future__ import annotations

import os
import tempfile

_db_path = os.path.join(tempfile.mkdtemp(prefix="qp-test-"), "test.db")
os.environ["QP_DB_PATH"] = _db_path
# Never start paid background model calls from a test application's lifespan.
os.environ["STOCK_PREDICTION_WARM_ENABLED"] = "false"

os.environ["WEBSITE_API_KEY"] = "offline-internal-test-key"
