"""Prepare a reviewable, hash-guarded backend patch: claim-level grounding audit for analysts.

Numbers stated in an analyst report (summary and signal values) must appear in the
data the analyst was given, and cited evidence must not post-date the decision
cutoff. Violations are recorded as `claim_validation` session events; the report
contract and decision path are unchanged (no extra model calls).
Writes only under audit/implementation/backend-patch-claims.
"""
from pathlib import Path
import hashlib
import json

backend = Path("D:/QP/agent-service")
output = Path("audit/implementation/backend-patch-claims")
output.mkdir(parents=True, exist_ok=True)
manifest = []


def save(relative, updated, new=False):
    target = output / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(updated, encoding="utf-8", newline="")
    before = None if new else hashlib.sha256((backend / relative).read_bytes()).hexdigest()
    manifest.append({"path": relative, "before_sha256": before,
                     "after_sha256": hashlib.sha256(target.read_bytes()).hexdigest()})


def replace_once(source, old, new, label):
    if source.count(old) != 1:
        raise SystemExit(f"{label}: anchor not found exactly once; inspect before preparing")
    return source.replace(old, new, 1)


save("app/agents/claims.py", '''"""Claim-level grounding audit for analyst reports (numbers in code; LLMs only interpret).

An analyst may interpret the data it was given; it may not introduce numbers or
evidence that the data does not contain. This audit never edits a report; it
records what is unsupported so reviewers and the UI can see it.
"""
from __future__ import annotations

import re
import threading
from datetime import datetime, timezone

NUMBER = re.compile(r"(?<![A-Za-z_])[-+]?\\d+(?:,\\d{3})*(?:\\.\\d+)?")
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
''', new=True)

util = (backend / "app/agents/_util.py").read_text(encoding="utf-8")
util = replace_once(util, '''def call_json(role: str, session_id: str, system: str, user: str,
              schema: type[BaseModel], fixed: dict | None = None) -> BaseModel:''', '''def call_json(role: str, session_id: str, system: str, user: str,
              schema: type[BaseModel], fixed: dict | None = None,
              grounding: str | None = None, as_of=None) -> BaseModel:''', "_util signature")
util = replace_once(util, '''            body.update(fixed)  # fixed fields (identity etc.) are never LLM-owned
            return schema(**body)''', '''            body.update(fixed)  # fixed fields (identity etc.) are never LLM-owned
            result = schema(**body)
            if grounding is not None:
                # Record (never rewrite) numbers and evidence the provided data does not support.
                from app.agents import claims
                claims.remember(session_id, fixed.get("agent", role), claims.audit(result, grounding, as_of))
            return result''', "_util return")
save("app/agents/_util.py", util)

analysts = (backend / "app/agents/analysts.py").read_text(encoding="utf-8")
analysts = replace_once(analysts, '''    return call_json("fundamentals", session_id, system, user, S.AnalystReport, {"agent": "fundamentals"})''',
                        '''    return call_json("fundamentals", session_id, system, user, S.AnalystReport, {"agent": "fundamentals"},
                     grounding=user, as_of=as_of)''', "fundamentals")
analysts = replace_once(analysts, '''    return call_json("news", session_id, system, user, S.AnalystReport, {"agent": "news"})''',
                        '''    return call_json("news", session_id, system, user, S.AnalystReport, {"agent": "news"},
                     grounding=user, as_of=as_of)''', "news")
analysts = replace_once(analysts, '''    return call_json("macro", session_id, system, user, S.AnalystReport, {"agent": "macro"})''',
                        '''    return call_json("macro", session_id, system, user, S.AnalystReport, {"agent": "macro"},
                     grounding=user, as_of=as_of)''', "macro")
save("app/agents/analysts.py", analysts)

graph = (backend / "app/agents/graph.py").read_text(encoding="utf-8")
graph = replace_once(graph, '''                        log_event(session_id, "analyst", name, "done")''', '''                        log_event(session_id, "analyst", name, "done")
                        from app.agents import claims
                        claim_audit = claims.take(session_id, name)
                        if claim_audit is not None:
                            log_event(session_id, "claim_validation", name, claim_audit["status"],
                                      json.dumps(claim_audit, sort_keys=True)[:1000])''', "graph analyst event")
save("app/agents/graph.py", graph)

save("tests/test_claim_audit.py", '''from datetime import datetime, timezone

from app import schemas as S
from app.agents import claims


def report(summary, signals=(), evidence=()):
    return S.AnalystReport(agent="fundamentals", summary=summary, confidence=0.5,
                           signals=[S.Signal(name=n, value=v, direction="neutral") for n, v in signals],
                           evidence=list(evidence))


GROUNDING = "tape: last=2451.35 return_observed_bars=+4.20% high_observed_bars=2610.00 avgvol20d=1,234,567"


def test_numbers_in_the_given_data_are_verified():
    result = claims.audit(report("Price 2451.35 is 4.2% above the start; high was 2610.", [("ret", 4.2)]), GROUNDING)
    assert result["status"] == "verified" and result["unsupported_numbers"] == []


def test_invented_numbers_and_late_evidence_are_flagged_not_rewritten():
    as_of = datetime(2026, 10, 1, tzinfo=timezone.utc)
    late = S.Evidence(source="news", ref="item-9", available_at=datetime(2026, 10, 5, tzinfo=timezone.utc))
    original = report("PE ratio of 31.7 implies a target of 2900.", [("pe", 31.7)], [late])
    result = claims.audit(original, GROUNDING, as_of)
    assert result["status"] == "unsupported"
    assert 31.7 in result["unsupported_numbers"] and 2900.0 in result["unsupported_numbers"]
    assert result["evidence_after_cutoff"] == ["item-9"]
    assert original.summary.startswith("PE ratio"), "the audit never edits the report"


def test_audits_are_handed_to_the_session_once():
    claims.remember("s1", "news", {"status": "verified"})
    assert claims.take("s1", "news") == {"status": "verified"}
    assert claims.take("s1", "news") is None
''', new=True)

(output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Prepared {len(manifest)} files in {output}")
