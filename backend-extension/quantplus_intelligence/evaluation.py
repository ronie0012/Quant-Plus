"""Evaluation harness for labelled news/sentiment corpora and probabilistic forecasts.

Nothing here creates labels. It evaluates human-reviewed labels against model
outputs under rules that prevent leakage and post-hoc threshold changes:

* splits are grouped by event cluster and issuer and separated in time;
* thresholds must be pre-registered and hashed before the holdout is scored;
* metrics carry bootstrap confidence intervals and per-slice breakdowns;
* probability metrics (Brier, log loss, reliability bins) apply only to
  outputs that are genuinely probabilities.
"""
from __future__ import annotations

import hashlib
import json
import math
import random
from collections import defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class LabelledItem:
    item_id: str
    cluster_id: str
    issuer: str
    published_at: str
    label: str
    prediction: str | None
    slices: tuple[str, ...] = ()


def grouped_time_split(items: list[LabelledItem], train=.6, validation=.2):
    """Assign whole clusters and issuers to one split, ordered by first publication time.

    A cluster or issuer never appears in two splits, so syndicated copies and the
    same company's story cannot leak from training into evaluation.
    """
    groups: dict[str, list[LabelledItem]] = defaultdict(list)
    parent: dict[str, str] = {}

    def find(key):
        while parent.setdefault(key, key) != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    for item in items:
        a, b = find("c:" + item.cluster_id), find("i:" + item.issuer)
        if a != b:
            parent[b] = a
    for item in items:
        groups[find("c:" + item.cluster_id)].append(item)
    ordered = sorted(groups.values(), key=lambda group: min(i.published_at for i in group))
    total = len(items)
    splits = {"train": [], "validation": [], "test": []}
    seen = 0
    for group in ordered:
        name = "train" if seen < total * train else "validation" if seen < total * (train + validation) else "test"
        splits[name].extend(group)
        seen += len(group)
    return splits


def macro_f1(pairs: list[tuple[str, str | None]], classes: list[str]):
    """Macro-F1 over `classes`; abstentions (None) count as misses for recall."""
    scores = {}
    for name in classes:
        tp = sum(1 for label, pred in pairs if label == name and pred == name)
        fp = sum(1 for label, pred in pairs if label != name and pred == name)
        fn = sum(1 for label, pred in pairs if label == name and pred != name)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        scores[name] = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return sum(scores.values()) / len(classes), scores


def bootstrap_ci(values: list, statistic, samples=1000, seed=7, level=.95):
    if not values:
        return None
    rng = random.Random(seed)
    stats = sorted(statistic([values[rng.randrange(len(values))] for _ in values]) for _ in range(samples))
    low = stats[int((1 - level) / 2 * samples)]
    high = stats[int((1 + level) / 2 * samples) - 1]
    return [round(low, 4), round(high, 4)]


def evaluate_classification(items: list[LabelledItem], classes: list[str], minimum_slice=20):
    pairs = [(i.label, i.prediction) for i in items]
    overall, per_class = macro_f1(pairs, classes)
    coverage = sum(p is not None for _, p in pairs) / len(pairs) if pairs else 0.0
    slices = defaultdict(list)
    for item in items:
        for name in item.slices:
            slices[name].append((item.label, item.prediction))
    return {
        "n": len(items),
        "macro_f1": round(overall, 4),
        "macro_f1_ci95": bootstrap_ci(pairs, lambda sample: macro_f1(sample, classes)[0]),
        "per_class_f1": {k: round(v, 4) for k, v in per_class.items()},
        "coverage": round(coverage, 4),
        "slices": {name: ({"n": len(rows), "macro_f1": round(macro_f1(rows, classes)[0], 4)}
                          if len(rows) >= minimum_slice else {"n": len(rows), "macro_f1": None,
                                                              "reason": f"fewer than {minimum_slice} items"})
                   for name, rows in sorted(slices.items())},
    }


def probability_metrics(probabilities: list[float], outcomes: list[int], bins=10):
    """Brier score, log loss and reliability bins for genuine probabilities only."""
    if len(probabilities) != len(outcomes) or not probabilities:
        raise ValueError("Probabilities and outcomes must be non-empty and aligned")
    if any(not 0 <= p <= 1 or not math.isfinite(p) for p in probabilities):
        raise ValueError("Probability metrics need values in [0, 1]; scores are not probabilities")
    eps = 1e-12
    brier = sum((p - o) ** 2 for p, o in zip(probabilities, outcomes)) / len(outcomes)
    log_loss = -sum(o * math.log(max(p, eps)) + (1 - o) * math.log(max(1 - p, eps))
                    for p, o in zip(probabilities, outcomes)) / len(outcomes)
    table = []
    for index in range(bins):
        low, high = index / bins, (index + 1) / bins
        members = [(p, o) for p, o in zip(probabilities, outcomes)
                   if low <= p < high or (index == bins - 1 and p == 1)]
        table.append({"bin": [low, high], "n": len(members),
                      "mean_probability": round(sum(p for p, _ in members) / len(members), 4) if members else None,
                      "observed_rate": round(sum(o for _, o in members) / len(members), 4) if members else None})
    base = sum(outcomes) / len(outcomes)
    return {"n": len(outcomes), "brier": round(brier, 6), "log_loss": round(log_loss, 6),
            "base_rate_brier": round(base * (1 - base), 6), "reliability": table}


def registration_hash(registration: dict) -> str:
    return hashlib.sha256(json.dumps(registration, sort_keys=True).encode()).hexdigest()


def check_preregistered(registration: dict, recorded_hash: str):
    """Refuse holdout evaluation unless thresholds were frozen before scoring."""
    required = {"corpus_sha256", "classes", "split", "thresholds", "registered_at"}
    missing = required - registration.keys()
    if missing:
        raise ValueError(f"Registration is missing {sorted(missing)}")
    if registration_hash(registration) != recorded_hash:
        raise ValueError("Registration changed after it was frozen; holdout evaluation refused")
