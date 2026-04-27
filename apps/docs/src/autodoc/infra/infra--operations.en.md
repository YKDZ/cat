# Operations & Tasks

> **Section**: Infra  ·  **Subject ID**: `infra/operations`

**Primary package**: `@cat/operations`

## API Reference

| Symbol | Kind | Description |
| ------ | ---- | ----------- |
| `addTermToConceptOp` | function | Add a term entry to an existing termConcept.

After the write completes, the dom |
| `AddTermToConceptInput` | type |  |
| `AddTermToConceptOutput` | type |  |
| `autoTranslateOp` | function | Auto-translate a translatable element.

Fetches machine-translation suggestions  |
| `AutoTranslateInput` | type |  |
| `AutoTranslateOutput` | type |  |
| `buildMemoryRecallVariantsOp` | function | Build recall variants for a single memory item and persist them.

SOURCE side va |
| `BuildMemoryRecallVariantsInput` | type |  |
| `buildTermRecallVariantsOp` | function | Build and persist recall variants for a single concept.

Variant types produced: |
| `BuildTermRecallVariantsInput` | type |  |
| `collectMemoryRecallOp` | function | Aggregated memory recall — multi-channel evidence merge.

Channels (in order of  |
| `CollectMemoryRecallInput` | type |  |
| `collectTermRecallOp` | function |  |
| `CollectTermRecallInput` | type |  |
| `calibrateBm25Confidence` | function | Batch-normalize BM25-channel evidences within a result set.

Algorithm:
1. Colle |
| `calibrateMemoryBm25` | function | Apply BM25 confidence calibration to memory recall RawResult[].

Mutates the evi |
| `calibrateTermBm25` | function | Apply confidence calibration to term recall RawResult[] (currently no-op, reserv |
| `CalibratedBm25Evidence` | interface | Calibrated BM25 evidence with raw score and normalization metadata. |
| `CalibrationSummary` | interface | Summary of batch BM25 calibration. |
| `createElementOp` | function | Create translatable elements.

First creates TranslatableStrings (with vectoriza |
| `CreateElementInput` | type |  |
| `CreateElementOutput` | type |  |
| `createTermOp` | function | Create term entries.

Directly stores term text (text + languageId), then builds |
| `CreateTermInput` | type |  |
| `CreateTermOutput` | type |  |
| `createTranslationOp` | function | Create translation records.

1. Create translatable strings (enqueue vectorizati |
| `CreateTranslationInput` | type |  |
| `CreateTranslationOutput` | type |  |
| `CreateTranslationPubPayload` | type |  |
| `createVectorizedStringOp` | function | Create vectorized strings and enqueue background vectorization when vector servi |
| `CreateVectorizedStringInput` | type |  |
| `CreateVectorizedStringOutput` | type |  |
| `deduplicateAndMatchOp` | function | Deduplicate term candidates and match against the existing glossary.

1. Normali |
| `DeduplicateAndMatchInput` | type |  |
| `DeduplicateAndMatchOutput` | type |  |
| `deleteTermOp` | function | Delete a term entry.

After deletion, the domain event handler automatically tri |
| `DeleteTermInput` | type |  |
| `DeleteTermOutput` | type |  |
| `diffElementsOp` | function | Compare old and new elements and apply additions, deletions, and updates.

1. Fe |
| `DiffElementsInput` | type |  |
| `DiffElementsOutput` | type |  |
| `fetchAdviseOp` | function | Fetch machine-translation suggestions.

Queries the TRANSLATION_ADVISOR plugin s |
| `FetchAdviseInput` | type |  |
| `FetchAdviseOutput` | type |  |
| `fetchBestTranslationCandidateOp` | function | Fetch the best translation candidate by running advisor + memory recall
in paral |
| `FetchBestTranslationCandidateInput` | type |  |
| `FetchBestTranslationCandidateOutput` | type |  |
| `findOrCreateAutoTranslatePR` | function | Find or create an AutoTranslate PR for the given language.
Concurrency safety is |
| `FindOrCreateAutoTranslatePRInput` | interface |  |
| `FindOrCreateAutoTranslatePRResult` | interface |  |
| *(174 more)* | | |

## Related Topics

- [`domain/core`](../domain/domain--core.en.md)
