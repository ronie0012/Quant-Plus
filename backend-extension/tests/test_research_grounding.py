from datetime import datetime, timezone
from types import SimpleNamespace as NS

from quantplus_intelligence.research_grounding import validate_report


def report(summary, signals=(), evidence=(), agent="technical"):
    return NS(summary=summary, signals=[NS(name=name, value=value) for name, value in signals],
              evidence=evidence, agent=agent)


def test_rejects_sign_swap_field_swap_and_small_quantities():
    for summary, facts in [("return_pct=-50%", "return_pct=50%"),
                           ("price=500", "price=100 volume=500"),
                           ("quantity=9", "quantity=2")]:
        assert validate_report(report(summary), facts)["status"] == "unsupported"


def test_signal_names_units_and_unknown_fields_are_bound():
    assert validate_report(report("price=100", [("price", 100)]), "price=100 volume=500")["status"] == "verified"
    assert validate_report(report("price=500", [("price", 500)]), "price=100 volume=500")["status"] == "unsupported"
    assert validate_report(report("return_pct=50%"), "return_pct=0.5%")["status"] == "unsupported"
    assert validate_report(report("price=100%"), "price=100")["status"] == "unsupported"
    assert validate_report(report("A qualitative summary", [("unknown", 0)]), "price=100")["status"] == "unsupported"


def test_lookback_windows_and_denominators_are_not_claims():
    facts = "nifty_ret20d=-4.28% up_days_10=7"
    for summary in ("nifty_ret20d fell -4.28% over 20 days", "a 20-day nifty_ret20d of -4.28%",
                    "up_days_10 7/10 sessions", "over the last 10 sessions up_days_10 was 7"):
        assert validate_report(report(summary), facts)["status"] == "verified", summary
    # A window word never hides a wrong value or a signed number.
    assert validate_report(report("nifty_ret20d -9 days"), facts)["status"] == "unsupported"
    assert validate_report(report("up_days_10 was 9 days"), facts)["status"] == "unsupported"


def test_conflicting_entities_and_untrusted_headline_numbers_abstain():
    assert validate_report(report("last=500"), "NSEI: last=100\nVIX: last=500")["status"] == "unsupported"
    assert validate_report(report("price=500", agent="news"), "Headline: price=500")["status"] == "unsupported"
    assert validate_report(report("No verified event figures available", agent="events"), "events unavailable")["status"] == "verified"


def test_evidence_refs_and_cutoff_are_enforced():
    cutoff = datetime(2026, 10, 14, tzinfo=timezone.utc)
    future = NS(ref="TCS.NS", available_at=datetime(2026, 10, 15, tzinfo=timezone.utc))
    invented = NS(ref="made-up-source", available_at=cutoff)
    result = validate_report(report("Price unavailable", evidence=[future, invented]), "instrument=TCS.NS", cutoff)
    assert result["evidence_after_cutoff"] == ["TCS.NS"]
    assert result["unknown_references"] == ["made-up-source"]
