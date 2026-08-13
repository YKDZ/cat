# Memory Recall

Memory recall retrieves translation memory entries and past translations that can be reused or adapted for the current source text. It is broader than term recall because a memory candidate may be an exact sentence, a fuzzy match, a token template, or a semantic neighbor.

## Retrieval Channels

Exact recall checks for identical source text and returns the strongest confidence. Fuzzy recall uses the pg_trgm trigram channel for short surface differences such as punctuation or minor spelling variation. Keyword Recall is separate: the selected Language Analyzer contributes versioned content tokens and lemmas, which are matched against fresh, scoped Recall Variants. Variant recall uses precomputed source variants for case-folded text, lemmas, fragments, and token templates.

Keyword Recall is available only when its Language Analysis and Recall Derivation versions are current for the requested memory scope. CAT does not substitute a weaker tokenizer or serve stale derived tokens when the selected analyzer or derivation is unavailable.

Semantic recall searches vectorized source chunks within the selected memory range. The range boundary is important: memory suggestions should come from the requested memory library, not from unrelated projects that happen to contain similar text.

## Candidate Merge

The collector keeps a global map by memory item id. Each channel can add evidence to the same candidate, but duplicate evidence is collapsed and the candidate keeps the highest confidence. This gives the ranking layer a compact candidate list without losing why a candidate matched.

## Template Adaptation

Template adaptation is the distinctive memory recall behavior. When a stored memory includes source and translation templates, CAT tokenizes the current source, builds a placeholder template, checks structural compatibility with the stored source template, and fills the stored translation template with current slot values.

This lets a memory such as a command containing a number, variable, or link produce an adapted translation instead of only returning the old text. The compatibility check is strict on purpose. If the current source template does not match, the system returns the original suggestion rather than inventing a risky adaptation.

## Ranking And Hard-Negative Control

Memory recall shares the precision pipeline and optional `RERANK_PROVIDER` band reranking used by term recall. Memory-specific guards protect template evidence from numeric-anchor false positives and suppress weak semantic hard negatives when an exact or template candidate is clearly better.

Context reranking uses neighboring source and approved translation text. It does not use concept overlap because memory items do not carry glossary concept definitions.
