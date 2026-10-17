import pytest

from quantplus_intelligence.evaluation import (
    LabelledItem,
    bootstrap_ci,
    check_preregistered,
    evaluate_classification,
    grouped_time_split,
    macro_f1,
    probability_metrics,
    registration_hash,
)


def item(i, cluster, issuer, day, label, prediction, slices=()):
    return LabelledItem(f"x{i}", cluster, issuer, f"2026-10-{day:02d}T00:00:00Z", label, prediction, slices)


def test_grouped_split_never_shares_clusters_or_issuers_across_splits():
    items = [item(i, f"c{i // 2}", f"I{i % 5}", 1 + i, "positive", "positive") for i in range(20)]
    splits = grouped_time_split(items)
    seen = {}
    for name, members in splits.items():
        for member in members:
            for key in ("c:" + member.cluster_id, "i:" + member.issuer):
                assert seen.setdefault(key, name) == name
    assert sum(len(v) for v in splits.values()) == 20


def test_macro_f1_counts_abstentions_as_misses():
    pairs = [("positive", "positive"), ("negative", None), ("negative", "negative"), ("neutral", "negative")]
    overall, per_class = macro_f1(pairs, ["positive", "negative", "neutral"])
    assert per_class["positive"] == 1.0
    assert per_class["neutral"] == 0.0
    assert overall == pytest.approx((1 + 0.5 + 0) / 3)


def test_slices_below_minimum_are_unavailable_and_ci_is_reported():
    items = [item(i, f"c{i}", f"I{i}", 1, "positive" if i % 2 else "negative", "positive",
                  ("hindi",) if i < 3 else ("english",)) for i in range(40)]
    report = evaluate_classification(items, ["positive", "negative"], minimum_slice=20)
    assert report["slices"]["hindi"]["macro_f1"] is None
    assert report["slices"]["english"]["n"] == 37
    low, high = report["macro_f1_ci95"]
    assert low <= report["macro_f1"] <= high
    assert bootstrap_ci([], lambda s: 0) is None


def test_probability_metrics_reject_scores_that_are_not_probabilities():
    with pytest.raises(ValueError, match="not probabilities"):
        probability_metrics([72.0], [1])
    report = probability_metrics([0.9, 0.1, 0.8, 0.2], [1, 0, 1, 0], bins=5)
    assert report["brier"] == pytest.approx((0.01 + 0.01 + 0.04 + 0.04) / 4)
    assert sum(b["n"] for b in report["reliability"]) == 4


def test_holdout_requires_a_frozen_registration():
    registration = {"corpus_sha256": "a" * 64, "classes": ["positive", "negative"],
                    "split": "grouped_time", "thresholds": {"macro_f1": 0.8}, "registered_at": "2026-10-14"}
    frozen = registration_hash(registration)
    check_preregistered(registration, frozen)
    with pytest.raises(ValueError, match="changed"):
        check_preregistered({**registration, "thresholds": {"macro_f1": 0.7}}, frozen)
    with pytest.raises(ValueError, match="missing"):
        check_preregistered({"classes": []}, frozen)
