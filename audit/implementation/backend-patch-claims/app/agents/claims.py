"""Claim-level grounding audit for analyst reports (numbers in code; LLMs only interpret).

An analyst may interpret the data it was given; it may not introduce numbers or
evidence that the data does not contain. This audit never edits a report; it
records what is unsupported so reviewers and the UI can see it.
"""
from __future__ import annotations

import re
import threading
from datetime import datetime, timezone

NUMBER = re.compile(r"(?<![A-Za-z_])[-+]?\d+(?:,\d{3})*(?:\.\d+)?")
_lock = threading.Lock()
_audits: dict[tuple[str, str], dict] = {}


def numbers_in(text: str) -> list[float]:
    values = []
    for match in NUMBER.finditer(text or ""):
        try:
            values.append(float(match.group(0).replace(",", "")))
        except ValueError:
            continue
    return values


def _supported(value: float, available: list[float]) -> bool:
    candidates = {value, abs(value), value / 100, value * 100, abs(value) / 100, abs(value) * 100}
    for given in available:
        for candidate in candidates:
            tolerance = max(abs(given) * 0.005, 0.005)
            if abs(candidate - given) <= tolerance or abs(abs(candidate) - abs(given)) <= tolerance:
                return True
    return False


def audit(report, grounding: str, as_of: datetime | None = None) -> dict:
    available = numbers_in(grounding)
    claimed = numbers_in(report.summary) + [float(s.value) for s in report.signals]
    # Small integers (counts, scales such as -1/0/1) are not factual numeric claims.
    material = [value for value in claimed if abs(value) > 1 and not float(value).is_integer() or abs(value) >= 10]
    unsupported = sorted({value for value in material if not _supported(value, available)})
    cutoff = as_of if as_of is None or as_of.tzinfo else as_of.replace(tzinfo=timezone.utc)
    late = [e.ref for e in report.evidence
            if cutoff is not None and (e.available_at if e.available_at.tzinfo else e.available_at.replace(tzinfo=timezone.utc)) > cutoff]
    return {"numbers_checked": len(material), "unsupported_numbers": unsupported[:20],
            "evidence_after_cutoff": late[:20],
            "status": "verified" if not unsupported and not late else "unsupported"}


def remember(session_id: str, agent: str, result: dict):
    with _lock:
        _audits[(session_id, agent)] = result


def take(session_id: str, agent: str) -> dict | None:
    with _lock:
        return _audits.pop((session_id, agent), None)
