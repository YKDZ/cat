# Term Recall

Term recall finds glossary concepts that should influence a translation. It combines multiple retrieval channels, enriches the winning concepts with subject and definition context, and then applies deterministic and optional model-based ranking.

## Retrieval Channels

Lexical recall compares the source text against surface term text. It is fast, always available, and useful as a fallback for prefixes, substrings, and near spelling matches.

Morphological recall uses normalized content tokens and lemma variants. It exists because term text often appears with changed case, tense, number, or inflection. The system precomputes recall variants for glossary concepts so the lookup path can stay fast.

Semantic recall searches vectorized term concept chunks inside the requested glossary range. It only runs when both vectorizer and vector storage services are available, and it constrains search to the current glossary scope to avoid cross-project contamination.

## Merge And Ranking

Results are merged by concept id. The highest confidence hit becomes the representative match, while evidence from other channels is retained and deduplicated. Longer terms win ties after confidence because a longer match usually carries more translation constraint than a shorter substring.

After retrieval, the precision pipeline profiles the query, fuses evidence, assigns candidate budgets, resolves taxonomy and topic signals, checks scope and anchors, and ranks candidates into tiers. A clear Tier 1 winner can suppress noisy Tier 3 candidates so a single weak semantic match does not dilute an exact glossary hit.

## Model Reranking

Model reranking is deliberately bounded. The ambiguity gate selects an eligible band, then a `RERANK_PROVIDER` service may reorder only that band. Prefix and tail candidates stay fixed. If the provider is unavailable, cancelled, times out, throws, or returns invalid scores, the pipeline keeps the deterministic order and records a trace.

The trade-off is conservative: CAT gives a model room to resolve ambiguous candidates, but not enough authority to overturn high-confidence deterministic evidence or make recall nondeterministic when the provider fails.

## Context Route

Route-level context reranking can use nearby source text, approved neighboring translations, and concept metadata to decide whether the top candidates are close enough to rerank. This path also fails closed and preserves original confidence values, so the API can explain where a candidate came from even when context changes its display order.
