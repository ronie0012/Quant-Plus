"""Real RSS/FYERS/AI acceptance probe. No credentials are printed or persisted."""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]


async def verify(backend, ai, http=False):
    sys.path.insert(0, str(backend))
    sys.path.insert(0, str(ROOT / "backend-extension"))
    os.chdir(backend)
    import httpx
    from fastapi import FastAPI
    from app.config import settings
    from app.data.fyers_provider import fyers
    from app.data.live_market import market
    from quantplus_intelligence.api import router
    from quantplus_intelligence.cache import cache
    app = FastAPI()
    app.include_router(router, prefix="/api")
    headers = {"X-Quantplus-Key": settings.WEBSITE_API_KEY}
    report = {"stocks": {}, "checks": {}, "market": None}
    private = [settings.WEBSITE_API_KEY, settings.FYERS_SECRET_KEY, fyers.token(), *settings.codecraft_keys()]
    try:
        async with httpx.AsyncClient(transport=None if http else httpx.ASGITransport(app=app),
                base_url="http://127.0.0.1:8000" if http else "http://test", headers=headers, timeout=120) as client:
            for symbol in ("RELIANCE", "TCS", "INFY"):
                start = time.monotonic()
                news = await client.get(f"/api/stocks/{symbol}/news")
                assert news.status_code == 200, f"News endpoint HTTP {news.status_code}"
                assert not any(s and s in news.text for s in private), "Secret leakage"
                body = news.json()
                sentiment = await client.get(f"/api/stocks/{symbol}/news-sentiment")
                assert sentiment.status_code == 200
                assert not any(s and s in sentiment.text for s in private), "Secret leakage"
                repeat_start = time.monotonic()
                repeat = (await client.get(f"/api/stocks/{symbol}/news")).json()
                assert repeat["updated_at"] == body["updated_at"], "News cache timestamp changed"
                summary = sentiment.json()
                report["stocks"][symbol] = {"articles": len(body["articles"]), "relevant": body["counts"]["relevant"],
                    "provider_status": body["provider_status"], "score": summary["score"], "confidence": summary["confidence"],
                    "price_confirmation_status": summary["price_confirmation_status"],
                    "market_data_status": summary["market_data_status"],
                    "latest_publication": body["articles"][0]["published_at"] if body["articles"] else None,
                    "duration_seconds": round(time.monotonic()-start, 2), "cached_request_ms": round((time.monotonic()-repeat_start)*1000, 2)}
                print(json.dumps({"symbol": symbol, **report["stocks"][symbol]}), flush=True)
            start = time.monotonic()
            response = await client.get("/api/market/sentiment")
            assert response.status_code == 200
            assert not any(s and s in response.text for s in private), "Secret leakage"
            result = response.json()
            report["market"] = {k: result[k] for k in ("score", "label", "regime", "confidence", "data_quality", "data_quality_score", "coverage", "weight_coverage", "market_session", "market_status", "score_basis", "trend", "signal_alignment", "divergences", "components", "warnings", "collector") if k in result}
            report["market"]["duration_seconds"] = round(time.monotonic()-start, 2)
            repeat = (await client.get("/api/market/sentiment")).json()
            report["checks"]["market_cache"] = repeat["updated_at"] == result["updated_at"]
            assert report["checks"]["market_cache"]
            sectors = await client.get("/api/market/sectors")
            assert sectors.status_code == 200 and len(sectors.json()["sectors"]) == 8
            assert not any(s and s in sectors.text for s in private), "Secret leakage"
            history = await client.get("/api/market/sentiment/history?range=1h&interval=5m")
            assert history.status_code == 200
            assert not any(s and s in history.text for s in private), "Secret leakage"
            report["checks"]["history_endpoint"] = isinstance(history.json().get("snapshots"), list)
            print(json.dumps({"market": {k: report["market"][k] for k in ("score", "confidence", "data_quality", "market_session", "duration_seconds")}}), flush=True)
            intelligence = await client.get(f"/api/market/intelligence?explain={'true' if ai else 'false'}")
            assert intelligence.status_code == 200
            assert not any(s and s in intelligence.text for s in private), "Secret leakage"
            ibody = intelligence.json()
            report["checks"]["ai_status"] = ibody["ai_status"]
            if ai and ibody["ai_status"] == "pending":
                # Wait only for the existing single-flight job; never create another model run.
                jobs = [job for key, job in cache.pending.items() if key.startswith("ai:")]
                if jobs:
                    try:
                        await asyncio.wait_for(asyncio.shield(jobs[0]), timeout=120)
                    except asyncio.TimeoutError:
                        pass
                    ibody = (await client.get("/api/market/intelligence")).json()
                    report["checks"]["ai_status"] = ibody["ai_status"]
                elif http:
                    for _ in range(24):
                        await asyncio.sleep(5)
                        ibody = (await client.get("/api/market/intelligence")).json()
                        report["checks"]["ai_status"] = ibody["ai_status"]
                        if ibody["ai_status"] != "pending":
                            break
            assert ibody["score"] == result["score"], "AI changed deterministic score"
            report["checks"]["explanation"] = ibody["ai_explanation"]
            stock = await client.get("/api/stocks/RELIANCE/intelligence?explain=false")
            assert stock.status_code == 200 and "quant_ai_context" in stock.json()
            assert not any(s and s in stock.text for s in private), "Secret leakage"
            report["checks"]["stock_context"] = True
            unauth = await client.get("/api/market/sentiment", headers={"X-Quantplus-Key": ""})
            report["checks"]["authentication"] = unauth.status_code == 401
            assert report["checks"]["authentication"]
            report["checks"]["secrets_absent"] = True
    finally:
        await market.close()
        await fyers.close()
        destination = ROOT / ".intelligence-test"
        destination.mkdir(exist_ok=True)
        (destination / "live-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Live report saved to .intelligence-test/live-report.json", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", type=Path, default=Path(r"D:\QP\agent-service"))
    parser.add_argument("--ai", action="store_true")
    parser.add_argument("--http", action="store_true", help="Probe the running backend on port 8000")
    args = parser.parse_args()
    asyncio.run(verify(args.backend.resolve(), args.ai, args.http))
