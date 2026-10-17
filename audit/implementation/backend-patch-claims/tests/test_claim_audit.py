from datetime import datetime, timezone

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
