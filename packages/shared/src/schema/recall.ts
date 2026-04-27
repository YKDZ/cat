import * as z from "zod";

// ─── Recall Channel ───────────────────────────────────────────────

/** The retrieval channel that produced a given recall evidence entry.
 *  "exact"         — exact source-string equality (memory side)
 *  "trgm"          — pg_trgm trigram similarity
 *  "lexical"       — ILIKE + word_similarity (term side)
 *  "morphological" — lemma/LEMMA variant match
 *  "sparse"        — content-word-weighted sparse lexical
 *  "template"      — TOKEN_TEMPLATE variant
 *  "fragment"      — FRAGMENT variant
 *  "bm25"          — PostgreSQL full-text BM25 ranking
 *  "semantic"      — dense vector similarity
 */
export const RecallChannelValues = [
  "exact",
  "trgm",
  "lexical",
  "morphological",
  "sparse",
  "template",
  "fragment",
  "bm25",
  "semantic",
  "multi",
] as const;

export const RecallChannelSchema = z.enum(RecallChannelValues);
export type RecallChannel = (typeof RecallChannelValues)[number];

// ─── Recall Evidence ──────────────────────────────────────────────

/**
 * A single piece of evidence explaining why a term / memory item was recalled.
 * Multiple evidence entries may be merged when a single candidate was hit by
 * more than one retrieval channel.
 */
export const RecallEvidenceSchema = z.object({
  /** Which recall channel produced this evidence. */
  channel: RecallChannelSchema,
  /** The text that was actually matched (may differ from the query). */
  matchedText: z.string().optional(),
  /** Variant text that was stored and matched. */
  matchedVariantText: z.string().optional(),
  /** Variant type of the matched text. */
  matchedVariantType: z.string().optional(),
  /** Confidence contributed by this specific channel (0–1). */
  confidence: z.number().min(0).max(1),
  /** Human-readable explanation for ranking or debugging. */
  note: z.string().optional(),
});

export type RecallEvidence = z.infer<typeof RecallEvidenceSchema>;

// ─── Recall Debug Context ────────────────────────────────────────

/**
 * Optional debug information attached to a fused recall result.
 * Only emitted when debug mode is enabled or during regression testing.
 */
export const RecallDebugContextSchema = z.object({
  /** Raw query text used for this recall. */
  queryText: z.string().optional(),
  /** Source language used. */
  sourceLanguageId: z.string().optional(),
  /** Channels that were attempted (regardless of hit). */
  channelsAttempted: z.array(RecallChannelSchema).optional(),
  /** Rerank boosts or penalties applied, with explanations. */
  rerankNotes: z.array(z.string()).optional(),
});

export type RecallDebugContext = z.infer<typeof RecallDebugContextSchema>;
