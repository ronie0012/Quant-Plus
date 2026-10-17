"""Phase 3: Technical Analyst — real yfinance data -> LLM -> schema-valid AnalystReport."""
from __future__ import annotations
import json
from datetime import datetime
from app import schemas as S
from app.agents._util import call_json
from app.data.yfinance_provider import YFinanceProvider
from app.agents.features import describe

SYSTEM = ("You are the Technical Analyst. Use ONLY the feature block provided. "
          "Return JSON matching AnalystReport: {summary, signals[], confidence, evidence[]}. "
          "signals: [{name, value, direction}] where direction is one of bullish|bearish|neutral. "
          "evidence: [{source, ref, available_at}] with available_at copied from the as_of given. "
          "confidence is a number 0-1. "
          "If flush_flag or blowoff_flag is true, you MUST include an explicit 'exhaustion/reversal risk' "
          "signal entry (name=exhaustion_reversal_risk) in signals, regardless of your directional call — "
          "state which flag is true and the ret_5d_pct value, and mention it in summary. "
          "All keys REQUIRED, never return an empty object, never markdown. "
          "Never invent prices or dates outside the input.")

def run(instrument: str, as_of: datetime, interval: str, session_id: str) -> S.AnalystReport:
    from app.data.local_store import DeliveryStore
    from app.agents.features import exhaustion_features, format_exhaustion
    df = YFinanceProvider().ohlcv(instrument, as_of, interval, lookback=60)
    # M2 rehab: the ticker-own exhaustion distribution needs a dedicated deep
    # pull, decoupled from the analyst's 60-bar feature window. The 60-bar frame
    # left only 59 bars of pre-asof history, so every live session silently took
    # the 8.0% fallback branch (96/96 cached sessions). Same cache file (the key
    # carries no lookback) — zero extra network, just a longer tail — and the
    # same asof bar, so ret_5d/distances stay aligned with describe() above.
    df_hist = YFinanceProvider().ohlcv(instrument, as_of, interval, lookback=400)
    # Compute once, use twice: prompt line + session checkpoint the Devil reads.
    # The Devil must evaluate this exact dict (pass-through), never a recompute.
    exh = exhaustion_features(df_hist, len(df_hist) - 1)
    from app.agents.graph import _save_ckpt  # lazy: graph imports this module
    _save_ckpt(session_id, "exhaustion", json.dumps(exh))
    user = (f"instrument={instrument} as_of={as_of.isoformat()}\n{describe(df, interval)}\n"
            f"{format_exhaustion(exh)}\n"
            f"{DeliveryStore().line(instrument, as_of)}")
    return call_json("technical", session_id, SYSTEM, user, S.AnalystReport, {"agent": "technical"}, grounding=user, as_of=as_of)
