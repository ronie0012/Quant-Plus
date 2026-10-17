# News labelling guidelines (v1, 2026-10-14)

These guidelines govern the human-reviewed corpus required by roadmap Phases 5 and 6. No labels
exist yet; `scripts/export-news-labelling-batch.py` exports unlabelled items from the news archive.

## Fields

| Field | Values | Rule |
| --- | --- | --- |
| `label_relevance` | `relevant`, `not_relevant`, `ambiguous` | Relevant only if the item is materially about the queried issuer, not a namesake, sector roundup or listicle. |
| `label_entity` | NSE symbol or `none` | The issuer the item is actually about. Namesakes (e.g. HDFC Life vs HDFC Bank) are distinct. |
| `label_tone` | `positive`, `negative`, `neutral`, `mixed` | Tone of the stated development for the issuer, not a price forecast. |
| `label_event_type` | a key of `CATEGORY_PATTERNS` or `none` | The primary development type. |
| `label_certainty` | `reported`, `speculative`, `denial` | Rumours, "sources said", "considering" are speculative. |

## Process

1. Two reviewers label every item independently; a third adjudicates disagreements. Record
   disagreement before adjudication (Cohen's kappa per field).
2. Keep balanced slices: negation, speculation, comparison periods, earnings surprises, sector
   sensitivity, Hindi/mixed-language, namesakes, corrected/updated stories.
3. Freeze the corpus (SHA-256 of the CSV) and register classes, split method (grouped by cluster and
   issuer, time-ordered) and thresholds with `quantplus_intelligence.evaluation.registration_hash`
   **before** scoring the test split. Changing thresholds afterwards invalidates the holdout.
4. Targets from the roadmap (relevance precision >= 95%, tone macro-F1 >= 0.80) are proposals to
   confirm in the registration, with confidence intervals reported, never relaxed after viewing results.
