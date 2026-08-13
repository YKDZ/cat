import {
  addProjectTargetLanguages,
  assertLanguageAnalysisPolicySnapshot,
  executeCommand,
  type DbHandle,
} from "@cat/domain";
import { NormalizedLanguageIdSchema } from "@cat/shared";
import * as z from "zod";

import type { Context } from "#/utils/context.ts";

import { assertLanguageAnalysisPreflight } from "./language-analysis-preflight.ts";

const ProjectTargetLanguageIdsSchema = z.array(NormalizedLanguageIdSchema);

export const prepareProjectTargetLanguageAdmission = async (
  languageIds: readonly string[],
  context: Pick<Context, "drizzleDB" | "pluginManager" | "requestSignal">,
) => {
  const normalizedLanguageIds = [
    ...new Set(ProjectTargetLanguageIdsSchema.parse(languageIds)),
  ];
  const policySnapshot = await assertLanguageAnalysisPreflight(
    normalizedLanguageIds,
    context,
  );

  return {
    languageIds: normalizedLanguageIds,
    write: async (db: DbHandle, projectId: string): Promise<void> => {
      if (normalizedLanguageIds.length === 0) return;
      await executeCommand(
        { db },
        assertLanguageAnalysisPolicySnapshot,
        policySnapshot,
      );
      await executeCommand({ db }, addProjectTargetLanguages, {
        projectId,
        languageIds: normalizedLanguageIds,
      });
    },
  };
};
