import type { OperationContext } from "@cat/domain";
import type { JSONType } from "@cat/shared/schema/json";

import {
  executeCommand,
  executeQuery,
  getDbHandle,
  getConceptRecallDetail,
  replaceTermRecallVariants,
} from "@cat/domain";
import * as z from "zod";

import { nlpBatchSegmentOp } from "./nlp-batch-segment";
import { buildTokenWindows, joinLemmas } from "./nlp-normalization";

// Maximum lemma window size for multi-word terms
const MAX_WINDOW_SIZE = 6;

export const BuildTermRecallVariantsInputSchema = z.object({
  conceptId: z.number().int(),
});

export type BuildTermRecallVariantsInput = z.infer<
  typeof BuildTermRecallVariantsInputSchema
>;

/**
 * Build and persist recall variants for a single concept.
 *
 * Variant types produced:
 * - SURFACE: exact original text
 * - CASE_FOLDED: lowercased text
 * - LEMMA: joined lemmas (when NLP tokens provided)
 *
 * For multi-word terms a limited lemma window is also stored (windowSize in meta).
 */
export const buildTermRecallVariantsOp = async (
  data: BuildTermRecallVariantsInput,
  ctx?: OperationContext,
): Promise<void> => {
  const { client: drizzle } = await getDbHandle();

  // Fetch all terms for the concept
  const detail = await executeQuery({ db: drizzle }, getConceptRecallDetail, {
    conceptId: data.conceptId,
  });

  if (!detail) return;

  // Group terms by language
  const termsByLang = new Map<string, string[]>();
  for (const t of detail.terms) {
    const existing = termsByLang.get(t.languageId);
    if (existing) {
      existing.push(t.text);
    } else {
      termsByLang.set(t.languageId, [t.text]);
    }
  }

  // Build and save variants per language
  const perLangWork = [...termsByLang.entries()].map(
    async ([languageId, texts]) => {
      const termKey = (text: string) => `${languageId}\0${text}`;
      const segmented = await nlpBatchSegmentOp(
        {
          languageId,
          items: texts.map((text) => ({ id: termKey(text), text })),
        },
        ctx,
      );

      const tokensByTermKey = new Map(
        segmented.results.map(({ id, result }) => [id, result.tokens]),
      );

      const variants: Array<{
        text: string;
        normalizedText: string;
        variantType: "SURFACE" | "CASE_FOLDED" | "LEMMA";
        meta: JSONType | null;
      }> = [];

      for (const text of texts) {
        const trimmed = text.trim();
        if (trimmed.length === 0) continue;

        // SURFACE: original text
        variants.push({
          text: trimmed,
          normalizedText: trimmed,
          variantType: "SURFACE",
          meta: null,
        });

        // CASE_FOLDED: lowercased
        const caseFolded = trimmed.toLowerCase();
        if (caseFolded !== trimmed) {
          variants.push({
            text: trimmed,
            normalizedText: caseFolded,
            variantType: "CASE_FOLDED",
            meta: null,
          });
        }

        // LEMMA variants (only when NLP tokens are available for this term text)
        const tokens = tokensByTermKey.get(termKey(text));
        if (tokens && tokens.length > 0) {
          const contentTokens = tokens.filter((t) => !t.isStop && !t.isPunct);
          if (contentTokens.length > 0) {
            const lemmaText = joinLemmas(contentTokens, languageId);
            if (lemmaText !== caseFolded && lemmaText !== trimmed) {
              variants.push({
                text: trimmed,
                normalizedText: lemmaText,
                variantType: "LEMMA",
                meta: null,
              });
            }

            // Multi-word lemma windows (only when there are multiple content tokens)
            if (contentTokens.length > 1) {
              const windows = buildTokenWindows(
                contentTokens,
                languageId,
                MAX_WINDOW_SIZE,
              );
              for (const win of windows) {
                if (win.tokenCount < 2) continue; // single tokens already covered above
                const windowMeta: JSONType = { windowSize: win.tokenCount };
                variants.push({
                  text: win.surface,
                  normalizedText: win.normalized,
                  variantType: "LEMMA",
                  meta: windowMeta,
                });
              }
            }
          }
        }
      }

      // Deduplicate by (variantType, normalizedText)
      const seen = new Set<string>();
      const uniqueVariants = variants.filter((v) => {
        const key = `${v.variantType}\0${v.normalizedText}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return executeCommand({ db: drizzle }, replaceTermRecallVariants, {
        conceptId: data.conceptId,
        languageId,
        variants: uniqueVariants,
      });
    },
  );

  await Promise.all(perLangWork);
};
