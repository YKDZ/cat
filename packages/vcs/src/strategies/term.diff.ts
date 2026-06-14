import type { DiffStrategy } from "../diff-strategy.ts";

import { createGenericStrategy } from "./generic.ts";

export const termDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "term",
  semanticLabel: "Term",
  impactScope: "LOCAL",
  watchedFields: ["term", "status", "type", "language"],
});

export const termConceptDiffStrategy: DiffStrategy = createGenericStrategy({
  entityType: "term_concept",
  semanticLabel: "Term Concept",
  impactScope: "CASCADING",
  watchedFields: ["definition", "termIds", "sourceLanguage"],
});
