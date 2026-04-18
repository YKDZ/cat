import type { AgentToolDefinition } from "@cat/agent";

import {
  executeQuery,
  getDbHandle,
  getElementContexts,
  listTranslationsByElement,
} from "@cat/domain";
import * as z from "zod";

import { assertElementInSession } from "./assert-session-scope.ts";

const getTranslationsArgs = z.object({
  elementId: z.int().positive().describe("Translatable element ID"),
  languageId: z
    .string()
    .optional()
    .describe("Target language ID (BCP-47). Falls back to session languageId"),
  includeContext: z
    .boolean()
    .default(false)
    .describe("Include element context metadata (annotations, comments)"),
});

export const getTranslationsTool: AgentToolDefinition = {
  name: "get_translations",
  description:
    "Get all existing translations for a specific translatable element in the target language. Returns translation text, vote count, translator, and creation time. Useful to check if an element already has translations before submitting a new one.",
  parameters: getTranslationsArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = getTranslationsArgs.parse(args);
    const languageId = parsed.languageId ?? ctx.session.languageId;

    if (!languageId) {
      throw new Error("get_translations requires languageId");
    }

    await assertElementInSession(parsed.elementId, ctx);

    const { client: db } = await getDbHandle();
    const translations = await executeQuery({ db }, listTranslationsByElement, {
      elementId: parsed.elementId,
      languageId,
    });

    const result: {
      translations: Array<{
        id: number;
        text: string;
        vote: number;
        translatorId: string | null;
        createdAt: Date;
      }>;
      contexts?: unknown;
    } = {
      translations: translations.map((translation) => ({
        id: translation.id,
        text: translation.text,
        vote: translation.vote,
        translatorId: translation.translatorId,
        createdAt: translation.createdAt,
      })),
    };

    if (parsed.includeContext) {
      const contextResult = await executeQuery({ db }, getElementContexts, {
        elementId: parsed.elementId,
      });
      result.contexts = contextResult.contexts;
    }

    return result;
  },
};
