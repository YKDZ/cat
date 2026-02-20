/**
 * @module spot-term
 *
 * **Task: `term.spot`** — Term Candidate Discovery
 *
 * Identifies potential terminology candidates from raw text using an LLM-backed
 * {@link TermExtractor} plugin (e.g. OpenAI). This is purely the "discovery"
 * phase: it analyzes the input text and returns text spans that are likely
 * domain-specific terms, along with their normalized forms and character ranges.
 *
 * This task does **not** perform any glossary matching, vector search, or
 * translation lookup. Its output is intended to be consumed by downstream tasks
 * such as `term.recognize` (semantic matching) or used independently for
 * term suggestion / terminology mining workflows.
 *
 * @see {@link recognizeTermTask} for glossary matching via vector similarity
 * @see {@link lookupTerms} for fast lexical glossary lookup
 */
import { defineTask } from "@/core";
import { firstOrGivenService } from "@cat/app-server-shared/utils";
import { PluginManager } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

const TermCandidateSchema = z.object({
  text: z.string(),
  normalizedText: z.string(),
  range: z.array(z.object({ start: z.number(), end: z.number() })),
  meta: z.unknown().optional(),
});

export const SpotTermInputSchema = z.object({
  termExtractorId: z.number().optional(),
  text: z.string(),
  languageId: z.string(),
});

export const SpotTermOutputSchema = z.object({
  candidates: z.array(TermCandidateSchema),
});

export const spotTermTask = await defineTask({
  name: "term.spot",
  input: SpotTermInputSchema,
  output: SpotTermOutputSchema,

  handler: async (data) => {
    const pluginManager = PluginManager.get("GLOBAL", "");

    const termExtractor = firstOrGivenService(
      pluginManager,
      "TERM_EXTRACTOR",
      data.termExtractorId,
    );

    if (!termExtractor) {
      logger.warn("PROCESSOR", {
        msg: "Term extractor service not found.",
      });
      return { candidates: [] };
    }

    const candidates = await termExtractor.service.extract({
      text: data.text,
      languageId: data.languageId,
    });

    return { candidates };
  },
});
