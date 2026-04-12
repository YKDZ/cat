import type { DbHandle, OperationContext } from "@cat/domain";
import type { JSONType } from "@cat/shared/schema/json";

import {
  executeCommand,
  getDbHandle,
  replaceMemoryRecallVariants,
} from "@cat/domain";
import * as z from "zod";

import { placeholderize } from "./memory-template";
import { buildTokenWindows, joinLemmas } from "./nlp-normalization";
import { tokenizeOp } from "./tokenize";

export const BuildMemoryRecallVariantsInputSchema = z.object({
  memoryItemId: z.number().int(),
  memoryId: z.string().uuid(),
  sourceText: z.string(),
  translationText: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  /** Pre-tokenized NLP tokens for source text. When absent, uses rule-based tokenizer for template detection only. */
  sourceNlpTokens: z
    .array(
      z.object({
        text: z.string(),
        lemma: z.string(),
        pos: z.string(),
        start: z.number().int(),
        end: z.number().int(),
        isStop: z.boolean(),
        isPunct: z.boolean(),
      }),
    )
    .optional(),
});

export type BuildMemoryRecallVariantsInput = z.infer<
  typeof BuildMemoryRecallVariantsInputSchema
>;

const MAX_WINDOW_SIZE = 6;

type VariantEntry = {
  text: string;
  normalizedText: string;
  variantType:
    | "SURFACE"
    | "CASE_FOLDED"
    | "LEMMA"
    | "TOKEN_TEMPLATE"
    | "FRAGMENT";
  meta: JSONType | null;
};

/**
 * Build recall variants for a single memory item and persist them.
 *
 * SOURCE side variants:
 *   - SURFACE: exact source text
 *   - CASE_FOLDED: lowercased
 *   - LEMMA: joined lemmas (when NLP tokens available)
 *   - TOKEN_TEMPLATE: canonical source template (placeholder form)
 *   - FRAGMENT: content tokens joined (stop words stripped)
 *
 * TRANSLATION side variants:
 *   - SURFACE: exact translation text
 *   - CASE_FOLDED: lowercased
 */
export const buildMemoryRecallVariantsOp = async (
  data: BuildMemoryRecallVariantsInput,
  ctx?: OperationContext,
  db?: DbHandle,
): Promise<void> => {
  const drizzle = db ?? (await getDbHandle()).client;

  // ─── Build SOURCE variants ────────────────────────────────────────────────

  const sourceVariants: VariantEntry[] = [];

  const sourceTrimmed = data.sourceText.trim();
  if (sourceTrimmed.length > 0) {
    // SURFACE
    sourceVariants.push({
      text: sourceTrimmed,
      normalizedText: sourceTrimmed,
      variantType: "SURFACE",
      meta: null,
    });

    // CASE_FOLDED
    const caseFolded = sourceTrimmed.toLowerCase();
    if (caseFolded !== sourceTrimmed) {
      sourceVariants.push({
        text: sourceTrimmed,
        normalizedText: caseFolded,
        variantType: "CASE_FOLDED",
        meta: null,
      });
    }

    // LEMMA + FRAGMENT (from NLP tokens)
    const nlpTokens = data.sourceNlpTokens;
    if (nlpTokens && nlpTokens.length > 0) {
      const contentTokens = nlpTokens.filter((t) => !t.isStop && !t.isPunct);

      if (contentTokens.length > 0) {
        // Single LEMMA variant
        const lemmaText = joinLemmas(contentTokens, data.sourceLanguageId);
        if (lemmaText !== caseFolded && lemmaText !== sourceTrimmed) {
          sourceVariants.push({
            text: sourceTrimmed,
            normalizedText: lemmaText,
            variantType: "LEMMA",
            meta: null,
          });
        }

        // FRAGMENT: content-only join (stop words stripped)
        const fragmentText = contentTokens
          .map((t) => t.text)
          .join(" ")
          .toLowerCase();
        if (fragmentText !== caseFolded && fragmentText !== lemmaText) {
          sourceVariants.push({
            text: sourceTrimmed,
            normalizedText: fragmentText,
            variantType: "FRAGMENT",
            meta: null,
          });
        }

        // Multi-word LEMMA windows
        if (contentTokens.length > 1) {
          const windows = buildTokenWindows(
            contentTokens,
            data.sourceLanguageId,
            MAX_WINDOW_SIZE,
          );
          for (const win of windows) {
            if (win.tokenCount < 2) continue;
            sourceVariants.push({
              text: win.surface,
              normalizedText: win.normalized,
              variantType: "LEMMA",
              meta: { windowSize: win.tokenCount },
            });
          }
        }
      }
    }

    // TOKEN_TEMPLATE: try to detect a canonical template using the tokenizer
    try {
      const { tokens } = await tokenizeOp({ text: sourceTrimmed }, ctx);
      const result = placeholderize(tokens, sourceTrimmed);
      if (result.template && result.template !== sourceTrimmed) {
        sourceVariants.push({
          text: sourceTrimmed,
          normalizedText: result.template,
          variantType: "TOKEN_TEMPLATE",
          meta: null,
        });
      }
    } catch {
      // Template detection is best-effort; silently skip on error
    }
  }

  // ─── Build TRANSLATION variants ───────────────────────────────────────────

  const translationVariants: VariantEntry[] = [];

  const translTrimmed = data.translationText.trim();
  if (translTrimmed.length > 0) {
    translationVariants.push({
      text: translTrimmed,
      normalizedText: translTrimmed,
      variantType: "SURFACE",
      meta: null,
    });

    const caseFoldedTransl = translTrimmed.toLowerCase();
    if (caseFoldedTransl !== translTrimmed) {
      translationVariants.push({
        text: translTrimmed,
        normalizedText: caseFoldedTransl,
        variantType: "CASE_FOLDED",
        meta: null,
      });
    }
  }

  // ─── Persist ─────────────────────────────────────────────────────────────

  const dedup = (variants: VariantEntry[]): VariantEntry[] => {
    const seen = new Set<string>();
    return variants.filter((v) => {
      const key = `${v.variantType}\0${v.normalizedText}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  if (sourceTrimmed.length > 0) {
    await executeCommand({ db: drizzle }, replaceMemoryRecallVariants, {
      memoryItemId: data.memoryItemId,
      memoryId: data.memoryId,
      languageId: data.sourceLanguageId,
      querySide: "SOURCE",
      variants: dedup(sourceVariants),
    });
  }

  if (translTrimmed.length > 0) {
    await executeCommand({ db: drizzle }, replaceMemoryRecallVariants, {
      memoryItemId: data.memoryItemId,
      memoryId: data.memoryId,
      languageId: data.translationLanguageId,
      querySide: "TRANSLATION",
      variants: dedup(translationVariants),
    });
  }
};
