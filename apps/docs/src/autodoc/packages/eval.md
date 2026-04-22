# @cat/eval

## Overview

* **Modules**: 12

* **Exported functions**: 9

* **Exported types**: 29

## Function Index

### apps/eval/src/config

### `loadSuite`

```ts
export const loadSuite = (suiteDir: string): LoadedSuite
```

### apps/eval/src/eval

### `evaluate`

```ts
export const evaluate = (scenarioResults: ScenarioResult[], testSets: Map<
    string,
    TermRecallTestSet | MemoryRecallTestSet | TranslationTestSet
  >, scorerNames: string[][], refs: RefResolver): EvaluationReport
```

### apps/eval/src/eval/scorers

### `getScorer`

```ts
export const getScorer = (name: string): Scorer
```

### `getAllScorers`

```ts
export const getAllScorers = (): Map<string, Scorer>
```

### apps/eval/src/harness

### `runHarness`

```ts
export const runHarness = async (opts: HarnessOptions): Promise<RunResult>
```

### apps/eval/src/harness/strategies

### `getStrategy`

```ts
export const getStrategy = (type: string): ScenarioStrategy
```

### apps/eval/src/observability

### `initObservability`

```ts
export const initObservability = (config: OTelConfig): OTelHandle
```

### apps/eval/src/report

### `generateReport`

```ts
export const generateReport = (runResult: RunResult, evaluation: EvaluationReport, thresholds?: Record<string, string>): Report
```

### apps/eval/src/seeder

### `seed`

```ts
export const seed = async (opts: SeedOptions): Promise<SeededContext>
```

## Type Index

* `LoadedSuite` (type)

* `SuiteConfig` (type)

* `ScenarioConfig` (type)

* `TermRecallTestSet` (type)

* `MemoryRecallTestSet` (type)

* `TermRecallTestCase` (type)

* `MemoryRecallTestCase` (type)

* `ReferenceTranslation` (type)

* `TranslationTestCase` (type)

* `TranslationTestSet` (type)

* `ScorerInput` (type)

* `ScoreValue` (type)

* `Scorer` (type)

* `CaseEvaluation` (type)

* `ScenarioEvaluation` (type)

* `EvaluationReport` (type)

* `RunResult` (type)

* `HarnessOptions` (type)

* `HarnessContext` (type)

* `CaseResult` (type)

* `ScenarioResult` (type)

* `ScenarioStrategy` (type)

* `OTelConfig` (type)

* `OTelHandle` (type)

* `ThresholdResult` (type)

* `Report` (type)

* `RunResultWithEvaluation` (type)

* `SeedOptions` (type)

* `SeededContext` (type)
