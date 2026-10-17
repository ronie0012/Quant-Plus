"""Shared LLM-JSON helper: schema-validate, one error-correction retry, then fail loudly."""
from __future__ import annotations
import json
from pydantic import BaseModel
from app.gateway.codecraft import gateway


def evidence_ledger(reports) -> str:
    """Deterministic evidence ledger for the decider prompts (manager + debate).

    ROOT-CAUSE FIX (data/prereg_manager_evidence.md): every analyst emits
    structured `signals` (name/value/direction) plus a `confidence`, but the
    Research Manager and the Bull/Bear debate were fed ONLY the `summary` prose.
    The Manager prompt then mandated a tally — "mean analyst confidence, and
    bullish vs bearish vs neutral signal counts" with a ">= 2-signal margin"
    rule — over numbers that never reached the model, so the counts were guessed
    (m9: mostly guardrail-free over-trading; m11: mostly flat, since a 2-signal
    margin can never be truthfully established). This renders every signal plus
    the exact tally, computed in code, so weight-of-evidence rests on the real
    evidence (project rule: numbers in code, LLMs only interpret).
    """
    lines: list[str] = []
    bull = bear = neu = 0
    confs: list[float] = []
    for r in reports:
        confs.append(float(r.confidence))
        sig = " | ".join(f"{s.name}={s.value:g} {s.direction}" for s in r.signals) or "(none)"
        for s in r.signals:
            if s.direction == "bullish":
                bull += 1
            elif s.direction == "bearish":
                bear += 1
            else:
                neu += 1
        lines.append(f"[{r.agent} conf={r.confidence:.2f}] {r.summary}\n  signals: {sig}")
    mean_conf = sum(confs) / len(confs) if confs else 0.0
    tally = (f"TALLY (computed in code, authoritative): bullish={bull} bearish={bear} "
             f"neutral={neu} signal_margin={bull - bear:+d} mean_conf={mean_conf:.2f} "
             f"analysts={len(reports)}")
    return "\n".join(lines) + "\n" + tally

def call_json(role: str, session_id: str, system: str, user: str,
              schema: type[BaseModel], fixed: dict | None = None,
              grounding: str | None = None, as_of=None) -> BaseModel:
    fixed = fixed or {}
    prompt = user
    last_err, last_raw = "", ""
    for attempt in range(2):
        raw = gateway.complete_json(role=role, session_id=session_id, system=system, user=prompt)
        last_raw = raw
        try:
            body = json.loads(raw)
            if not isinstance(body, dict):
                raise ValueError("top-level JSON must be an object")
            body.update(fixed)  # fixed fields (identity etc.) are never LLM-owned
            result = schema(**body)
            if grounding is not None:
                # Record (never rewrite) numbers and evidence the provided data does not support.
                from app.agents import claims
                claims.remember(session_id, fixed.get("agent", role), claims.audit(result, grounding, as_of))
            return result
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            fields = ", ".join(schema.model_fields.keys())
            prompt = (f"Your last output FAILED validation ({last_err}). Required top-level keys: {fields}. "
                      f"Your output was: {raw[:800]}\nReturn ONLY the corrected JSON object, no prose.\n" + user)
    raise RuntimeError(f"{role}: schema validation failed twice ({last_err}); aborting (never coerce garbage)")
