import type { AgentToolDefinition } from "@cat/agent";

import { executeQuery, getDbHandle, listMemoryIdsByProject } from "@cat/domain";
import { createTranslationOp } from "@cat/operations";
import {
  firstOrGivenService,
  resolvePluginManager,
} from "@cat/server-shared/plugin";
import * as z from "zod/v4";

import { assertElementInSession } from "./assert-session-scope.ts";

const submitTranslationArgs = z.object({
  elementId: z
    .int()
    .positive()
    .describe("Translatable element ID to translate"),
  text: z.string().min(1).describe("Translation text"),
  languageId: z
    .string()
    .optional()
    .describe("Target language ID (BCP-47). Falls back to session languageId"),
  createMemory: z
    .boolean()
    .default(true)
    .describe("Whether to save this translation to translation memory"),
});

export const submitTranslationTool: AgentToolDefinition = {
  name: "submit_translation",
  description:
    "Submit a new translation for a translatable element. The translation will be vectorized, stored, and automatically QA-checked. Optionally saves to translation memory for future reuse.",
  parameters: submitTranslationArgs,
  sideEffectType: "internal",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = submitTranslationArgs.parse(args);
    const languageId = parsed.languageId ?? ctx.session.languageId;

    if (!languageId) {
      throw new Error("submit_translation requires languageId");
    }

    const element = await assertElementInSession(parsed.elementId, ctx);
    const { client: db } = await getDbHandle();

    const pluginManager = resolvePluginManager(ctx.pluginManager);
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");
    const vectorStorage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");

    if (!vectorizer || !vectorStorage) {
      throw new Error(
        "TEXT_VECTORIZER or VECTOR_STORAGE service not available",
      );
    }

    let memoryIds: string[] = [];
    if (parsed.createMemory) {
      memoryIds = await executeQuery({ db }, listMemoryIdsByProject, {
        projectId: element.projectId,
      });
    }

    const result = await createTranslationOp({
      data: [
        {
          translatableElementId: parsed.elementId,
          text: parsed.text,
          languageId,
        },
      ],
      translatorId: null,
      memoryIds,
      vectorizerId: vectorizer.id,
      vectorStorageId: vectorStorage.id,
      documentId: element.documentId,
    });

    return {
      translationIds: result.translationIds,
      memoryItemIds: result.memoryItemIds,
    };
  },
};
