import { defineTask } from "@/core";
import { firstOrGivenService } from "@cat/app-server-shared/utils";
import {
  aliasedTable,
  and,
  eq,
  getDrizzleDB,
  inArray,
  term,
  termEntry,
  translatableString,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

export const SearchTermInputSchema = z.object({
  termExtractorId: z.int().optional(),
  termRecognizerId: z.int().optional(),
  glossaryIds: z.array(z.uuidv4()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
});

export const SearchTermOutputSchema = z.object({
  terms: z.array(
    z.object({
      term: z.string(),
      translation: z.string(),
      subject: z.string().nullable(),
    }),
  ),
});

export const searchTermTask = await defineTask({
  name: "term.search",
  input: SearchTermInputSchema,
  output: SearchTermOutputSchema,

  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const termExtractor = await firstOrGivenService(
      drizzle,
      pluginRegistry,
      "TERM_EXTRACTOR",
      data.termExtractorId,
    );
    const termRecognizer = await firstOrGivenService(
      drizzle,
      pluginRegistry,
      "TERM_RECOGNIZER",
      data.termRecognizerId,
    );

    if (!termExtractor) {
      logger.warn("PROCESSOR", {
        msg: `Term extractor service not found. No terms will be extracted.`,
      });
      return { terms: [] };
    }
    if (!termRecognizer) {
      logger.warn("PROCESSOR", {
        msg: `Term recognizer service not found. No terms will be recognized.`,
      });
      return { terms: [] };
    }

    // 获取术语化文本
    const termCandidates = await termExtractor.service.extract({
      text: data.text,
      languageId: data.sourceLanguageId,
    });

    const recognizedTerms = await termRecognizer.service.recognize({
      source: {
        text: data.text,
        candidates: termCandidates,
      },
      languageId: data.sourceLanguageId,
    });

    const termEntryIds = recognizedTerms.map((t) => t.termEntryId);

    if (termEntryIds.length === 0) {
      return { terms: [] };
    }

    // 查询术语关系
    const sourceTerm = aliasedTable(term, "sourceTerm");
    const translationTerm = aliasedTable(term, "translationTerm");
    const sourceString = aliasedTable(translatableString, "sourceString");
    const translationString = aliasedTable(
      translatableString,
      "translationString",
    );

    const terms = await drizzle
      .select({
        term: sourceString.value,
        translation: translationString.value,
        subject: termEntry.subject,
      })
      .from(termEntry)
      .innerJoin(sourceTerm, eq(sourceTerm.termEntryId, termEntry.id))
      .innerJoin(translationTerm, eq(sourceTerm.termEntryId, termEntry.id))
      .innerJoin(
        sourceString,
        and(
          eq(sourceString.id, sourceTerm.stringId),
          eq(sourceString.languageId, data.sourceLanguageId),
        ),
      )
      .innerJoin(
        translationString,
        and(
          eq(translationString.id, translationTerm.stringId),
          eq(translationString.languageId, data.translationLanguageId),
        ),
      )
      .where(
        and(
          inArray(termEntry.id, termEntryIds),
          inArray(termEntry.glossaryId, data.glossaryIds),
        ),
      );

    return { terms };
  },
});
