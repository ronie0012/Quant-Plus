"""Forecast Card routes. Generation is single-flight per stock and reuses same-bar cards."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from app.api.stocks import website_auth, stock_symbol

from .forecast import service
from .forecast.forecasters import gateway_complete

router = APIRouter(dependencies=[Depends(website_auth)], tags=["Forecast cards"])
_locks: dict[str, asyncio.Lock] = {}


def _sector(symbol: str) -> str:
    from app.api.stocks import stock_catalog
    return next((row["sector"] for row in stock_catalog() if row["symbol"] == symbol), "UNKNOWN")


def _latest(symbol: str, horizon: int) -> dict | None:
    for row in service.ledger().cards(symbol=symbol, limit=50):
        if row["card"]["horizon"] == horizon:
            return row
    return None


def _view(row: dict | None) -> dict | None:
    if row is None:
        return None
    book = service.ledger()
    settled = book.conn.execute(
        "SELECT COUNT(*) FROM forecast_ledger WHERE settled_at IS NOT NULL AND horizon=?",
        (row["card"]["horizon"],)).fetchone()[0]
    view = service.row_view(row, settled)
    card_id = service.card_from_dict(row["card"]).card_id
    view["extras"] = book.extras(card_id)
    view["sector_rank"] = book.tournament_rank(row["card"]["symbol"], row["card"]["horizon"])
    return view


def _horizon(value: int) -> int:
    if value not in (5, 20):
        raise HTTPException(422, "horizon must be 5 or 20")
    return value


async def _articles(name: str) -> list[dict] | None:
    """News on the main event loop (its caches are loop-bound); None lets the worker skip it."""
    try:
        from .news.service import news_service
        return (await news_service.stock_news(name)).get("articles", [])
    except Exception:  # noqa: BLE001
        return []


@router.get("/stocks/{stock}/forecast")
def latest(stock: str, horizon: int = Query(5)):
    return {"forecast": _view(_latest(stock_symbol(stock), _horizon(horizon))), "authority": "RESEARCH_ONLY"}


@router.post("/stocks/{stock}/forecast")
async def generate(stock: str, horizon: int = Query(5)):
    name, horizon = stock_symbol(stock), _horizon(horizon)
    lock = _locks.setdefault(f"{name}:{horizon}", asyncio.Lock())
    async with lock:
        articles = await _articles(name)
        try:
            out = await asyncio.to_thread(service.generate_live, name, horizon,
                                          gateway_complete("forecaster", f"forecast:{name}"),
                                          _sector(name), articles)
        except ValueError as error:
            raise HTTPException(409, str(error))
        except Exception as error:
            raise HTTPException(502, f"Forecast inputs unavailable: {type(error).__name__}")
    return {"forecast": _view(out["row"]), "reused": out["reused"], "authority": "RESEARCH_ONLY"}


@router.get("/stocks/{stock}/forecast/status")
async def tripwires(stock: str, horizon: int = Query(5)):
    name, horizon = stock_symbol(stock), _horizon(horizon)
    row = _latest(name, horizon)
    if row is None:
        return {"status": None, "reason": "no locked forecast"}
    articles = await _articles(name)
    try:
        snap, events = await asyncio.to_thread(service.live_snapshot, name, row, articles)
    except Exception as error:
        raise HTTPException(502, f"Live snapshot unavailable: {type(error).__name__}")
    return {**service.status(row, snap, events), "snapshot": snap, "new_events": events, "hash": row["hash"]}


@router.post("/stocks/{stock}/forecast/personal")
def personal(stock: str, horizon: int = Query(5), body: dict = Body(...)):
    name, horizon = stock_symbol(stock), _horizon(horizon)
    row = _latest(name, horizon)
    if row is None:
        raise HTTPException(404, "No locked forecast for this stock and horizon")
    if body.get("profile", "balanced") not in ("conservative", "balanced", "aggressive"):
        raise HTTPException(422, "profile must be conservative, balanced or aggressive")
    if len(body.get("positions", [])) > 500 or len(body.get("orders", [])) > 2000:
        raise HTTPException(422, "Book too large")
    for p in body.get("positions", []):
        p["sector"] = p.get("sector") or _sector(stock_symbol(p["symbol"]))
    return service.personal_view(row, _sector(name), body)


@router.get("/forecast/scoreboard")
def scoreboard():
    return service.ledger().scoreboard()


@router.post("/forecast/settle")
def settle():
    """Operator/scheduler route (not proxied to browsers): settle matured cards exactly once."""
    return service.settle_due(service.ledger(), service.provider_fetch)
