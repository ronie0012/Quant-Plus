"""Fail-closed field/sign validation for research reports before synthesis.

Numeric news/event extraction is not connected to the legacy graph: those
analysts must abstain from numeric signals rather than mining arbitrary prose.
"""
from __future__ import annotations

from datetime import timezone
import math
import re

NUMBER = re.compile(r"(?<![\w.])[-+]?\d+(?:,\d{3})*(?:\.\d+)?")
FIELD = re.compile(r"\b([A-Za-z][A-Za-z0-9_]*)\s*=\s*([-+]?\d+(?:,\d{3})*(?:\.\d+)?)\s*(%)?")
STAMP = re.compile(r"\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?")


def supported(value, given):
    if not math.isfinite(value) or not math.isfinite(given):
        return False
    places = len(str(float(value)).partition(".")[2])
    return (value == 0 and given == 0 or value * given > 0) and abs(value - given) <= .5 * 10 ** -places + 1e-9


def validate_report(report, grounding, as_of=None):
    fields = {}
    if report.agent not in {"news", "events"}:
        for match in FIELD.finditer(grounding):
            key, value, unit = match.groups()
            fields.setdefault(key.casefold(), set()).add((float(value.replace(",", "")), bool(unit)))
    # A repeated field with conflicting values is ambiguous, never an interchangeable pool.
    facts = {key: next(iter(values)) for key, values in fields.items() if len(values) == 1}
    unsupported = []
    for signal in report.signals:
        fact = facts.get(signal.name.casefold())
        if fact is None or not supported(float(signal.value), fact[0]):
            unsupported.append({"field": signal.name, "value": signal.value})
    summary = report.summary
    # Dates must be supplied verbatim; late references are separately rejected below.
    summary = STAMP.sub(lambda match: " " if match.group(0) in grounding else match.group(0), summary)
    checked = len(report.signals)
    for match in NUMBER.finditer(summary):
        checked += 1
        value = float(match.group(0).replace(",", ""))
        prefix = summary[max(0, match.start() - 80):match.start()]
        labels = [(m.start(), key) for key in facts for m in re.finditer(r"\b" + re.escape(key) + r"\b", prefix, re.I)]
        key = max(labels)[1] if labels else None
        fact = facts.get(key)
        percentage = bool(re.match(r"\s*(?:%|percent\b)", summary[match.end():], re.I))
        if fact is None or fact[1] != percentage or not supported(value, fact[0]):
            unsupported.append({"field": key, "value": value})
    cutoff = as_of if as_of is None or as_of.tzinfo else as_of.replace(tzinfo=timezone.utc)
    late = [e.ref for e in report.evidence if cutoff is not None and
            (e.available_at if e.available_at.tzinfo else e.available_at.replace(tzinfo=timezone.utc)) > cutoff]
    unknown = [e.ref for e in report.evidence if e.ref not in grounding]
    return {"numbers_checked": checked, "unsupported_claims": unsupported,
            "evidence_after_cutoff": late, "unknown_references": unknown,
            "status": "verified" if not unsupported and not late and not unknown else "unsupported"}
