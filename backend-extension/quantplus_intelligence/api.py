from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.stocks import website_auth
from .market import market_engine
from .news.service import news_service
from .news.resolver import normalize_symbol
from .intelligence import stock_intelligence, market_intelligence

router = APIRouter(dependencies=[Depends(website_auth)], tags=["QuantPlus intelligence"])
from .terminal_api import router as terminal_router
router.include_router(terminal_router)
from .forecast_api import router as forecast_router
router.include_router(forecast_router)


def symbol(value):
    try:
        return normalize_symbol(value)
    except ValueError:
        raise HTTPException(422, "Expected an NSE equity symbol")


@router.get("/stocks/{stock}/news")
async def stock_news(stock: str):
    return await news_service.stock_news(symbol(stock))


@router.get("/stocks/{stock}/news-sentiment")
async def stock_sentiment(stock: str):
    return await news_service.stock_sentiment(symbol(stock))


@router.get("/stocks/{stock}/intelligence")
async def stock_combined(stock: str, explain: bool = True):
    return await stock_intelligence(symbol(stock), explain)


@router.get("/market/sentiment")
async def sentiment():
    return await market_engine.sentiment()


@router.get("/market/sentiment/history")
async def sentiment_history(
    range: str = Query("1h", pattern="^(1h|1d|5d)$"),
    interval: str | None = Query(None, pattern="^(5m|15m|1h)$"),
):
    return {"range": range, "interval": interval or "5m", "snapshots": await market_engine.history(range, interval)}


@router.get("/market/intelligence")
async def intelligence(explain: bool = True):
    return await market_intelligence(explain)


@router.get("/market/news")
async def market_news():
    return await news_service.market_news()


@router.get("/market/sectors")
async def sectors():
    result = await market_engine.sentiment()
    available = [sector for sector in result["sectors"].values() if sector.get("score") is not None]
    return {"market": result["score"], "sectors": result["sectors"], "confidence": result["confidence"],
            "data_quality": result["data_quality"], "data_quality_score": result.get("data_quality_score"),
            "bullish_sectors": sum(s.get("score", 0) >= 60 for s in available),
            "neutral_sectors": sum(41 <= s.get("score", 0) <= 59 for s in available),
            "bearish_sectors": sum(s.get("score", 0) <= 40 for s in available),
            "updated_at": result["updated_at"]}
