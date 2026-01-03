import { defineWorkflow } from "@/core";
import { firstOrGivenService } from "@cat/app-server-shared/utils";
import { getDrizzleDB } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { TranslationSuggestionSchema } from "@cat/shared/schema/misc";
import * as z from "zod";
import { searchTermTask } from "./search-term";
import { logger } from "@cat/shared/utils";

export const FetchAdviseInputSchema = z.object({
  advisorId: z.number().optional(),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),

  glossaryIds: z.array(z.uuidv4()).default([]),
  termExtractorId: z.int().optional(),
  termRecognizerId: z.int().optional(),
});

export const FetchAdviseOutputSchema = z.object({
  suggestions: z.array(TranslationSuggestionSchema),
});

export const fetchAdviseWorkflow = await defineWorkflow({
  name: "advise.fetch",
  input: FetchAdviseInputSchema,
  output: FetchAdviseOutputSchema,

  dependencies: (data, { traceId }) => [
    searchTermTask.asChild(
      {
        text: data.text,
        sourceLanguageId: data.sourceLanguageId,
        translationLanguageId: data.translationLanguageId,
        glossaryIds: data.glossaryIds,
        termExtractorId: data.termExtractorId,
        termRecognizerId: data.termRecognizerId,
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();
    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    // 获取子任务（术语搜索）的结果
    // 注意：getTaskResult 返回数组，因为一个 Workflow 可能多次调用同一个 Task
    const [termResult] = getTaskResult(searchTermTask);
    const terms = termResult?.terms ?? [];

    const advisor = await firstOrGivenService(
      drizzle,
      pluginRegistry,
      "TRANSLATION_ADVISOR",
      data.advisorId,
    );

    if (!advisor) {
      logger.warn("PROCESSOR", {
        msg: `Translation advisor service not found. No suggestion will be given.`,
      });
      return { suggestions: [] };
    }

    const suggestions = await advisor.service.getSuggestions({
      value: data.text,
      terms,
      languageFromId: data.sourceLanguageId,
      languageToId: data.translationLanguageId,
    });

    return { suggestions };
  },
});
