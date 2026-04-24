import type {
  MemoryRecallBm25CapabilityEntry,
  MemoryRecallBm25CompressionProfile,
} from "@cat/shared/schema/memory-recall";

import {
  executeQuery,
  getDbHandle,
  listBm25MemorySuggestions,
  type RawMemorySuggestion,
  type RawBm25MemorySuggestion,
} from "@cat/domain";

export const BM25_DISABLED_REASON = "not-in-bm25-first-rollout";

export const MEMORY_RECALL_BM25_REGISTRY = {
  en: {
    languageId: "en",
    textSearchConfig: "english",
    tokenizerLabel: "postgres-english",
    compressionProfile: "bm25-ratio-k1-v1",
  },
  "zh-Hans": {
    languageId: "zh-Hans",
    textSearchConfig: "cat_zh_hans",
    tokenizerLabel: "zhparser-default",
    compressionProfile: "bm25-ratio-k1-v1",
  },
} as const satisfies Record<
  string,
  Omit<MemoryRecallBm25CapabilityEntry, "enabled" | "disabledReason">
>;

const isBm25LanguageId = (
  languageId: string,
): languageId is keyof typeof MEMORY_RECALL_BM25_REGISTRY =>
  Object.hasOwn(MEMORY_RECALL_BM25_REGISTRY, languageId);

export function compressBm25Score(
  rawScore: number,
  _profile: MemoryRecallBm25CompressionProfile,
): number {
  if (!Number.isFinite(rawScore) || rawScore <= 0) return 0;
  return rawScore / (rawScore + 1);
}

export function buildMemoryRecallBm25Capabilities(
  fullCatalog: string[],
  filterLanguageIds: string[] = [],
): MemoryRecallBm25CapabilityEntry[] {
  const targetIds =
    filterLanguageIds.length > 0 ? filterLanguageIds : fullCatalog;

  return targetIds
    .filter((languageId) => fullCatalog.includes(languageId))
    .map((languageId) => {
      const supported = isBm25LanguageId(languageId)
        ? MEMORY_RECALL_BM25_REGISTRY[languageId]
        : null;

      return supported
        ? { ...supported, enabled: true, disabledReason: null }
        : {
            languageId,
            enabled: false,
            textSearchConfig: null,
            tokenizerLabel: null,
            compressionProfile: null,
            disabledReason: BM25_DISABLED_REASON,
          };
    });
}

export async function collectBm25MemorySuggestionsOp(
  input: {
    text: string;
    sourceLanguageId: string;
    translationLanguageId: string;
    memoryIds: string[];
    maxAmount: number;
  },
  drizzle: Awaited<ReturnType<typeof getDbHandle>>["client"],
): Promise<RawMemorySuggestion[]> {
  const supported = isBm25LanguageId(input.sourceLanguageId)
    ? MEMORY_RECALL_BM25_REGISTRY[input.sourceLanguageId]
    : null;
  if (!supported) return [];

  const rows = await executeQuery({ db: drizzle }, listBm25MemorySuggestions, {
    ...input,
  });

  return rows.map((row: RawBm25MemorySuggestion) => ({
    ...row,
    confidence: compressBm25Score(row.rawScore, supported.compressionProfile),
    matchedText: row.source,
    evidences: [
      {
        channel: "bm25",
        matchedText: row.source,
        confidence: compressBm25Score(
          row.rawScore,
          supported.compressionProfile,
        ),
        note: `rum bm25 via ${supported.textSearchConfig}`,
      },
    ],
  }));
}
