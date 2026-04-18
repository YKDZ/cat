import type { DbHandle } from "@cat/domain";

import {
  executeCommand,
  executeQuery,
  getProject,
  getProjectSettings,
  getProjectTargetLanguages,
  listElementSourceTexts,
  listMemoryIdsByProject,
  upsertAutoTranslationEntry,
} from "@cat/domain";
import { serverLogger as logger } from "@cat/server-shared";

import { fetchBestTranslationCandidateOp } from "./fetch-best-translation-candidate";
import { findOrCreateAutoTranslatePR } from "./find-or-create-auto-translate-pr";

export interface RunAutoTranslatePipelineInput {
  projectId: string;
  documentId: string;
  elementIds: number[];
}

/**
 * @zh 预翻译流水线：检查项目设置，为每个启用语言生成候选并写入 changeset。
 * @en Pre-translation pipeline: check project settings, then for each enabled
 * language generate candidates and write them to a changeset.
 */
export const runAutoTranslatePipeline = async (
  ctx: { db: DbHandle },
  input: RunAutoTranslatePipelineInput,
): Promise<void> => {
  const { db } = ctx;
  const { projectId, documentId, elementIds } = input;

  if (elementIds.length === 0) return;

  const settings = await executeQuery({ db }, getProjectSettings, {
    projectId,
  });

  if (!settings.enableAutoTranslation) return;

  const projectRow = await executeQuery({ db }, getProject, { projectId });
  if (!projectRow?.features?.pullRequests) return;

  let targetLanguageIds: string[];
  if (
    settings.autoTranslationLanguages &&
    settings.autoTranslationLanguages.length > 0
  ) {
    targetLanguageIds = settings.autoTranslationLanguages;
  } else {
    const langs = await executeQuery({ db }, getProjectTargetLanguages, {
      projectId,
    });
    targetLanguageIds = langs.map((l) => l.id);
  }

  if (targetLanguageIds.length === 0) return;

  const elementRows = await executeQuery({ db }, listElementSourceTexts, {
    elementIds,
  });

  if (elementRows.length === 0) return;

  const memoryIds = await executeQuery({ db }, listMemoryIdsByProject, {
    projectId,
  });

  await Promise.all(
    targetLanguageIds.map(async (languageId) => {
      try {
        const relevantElements = elementRows.filter(
          (e) => e.sourceLanguageId !== languageId,
        );
        if (relevantElements.length === 0) return;

        const { changesetId } = await findOrCreateAutoTranslatePR(
          { db },
          { projectId, languageId },
        );

        const candidates = await Promise.all(
          relevantElements.map(async (elem) => {
            try {
              const candidate = await fetchBestTranslationCandidateOp({
                text: elem.text,
                sourceLanguageId: elem.sourceLanguageId,
                translationLanguageId: languageId,
                memoryIds,
              });
              return candidate ? { elementId: elem.id, ...candidate } : null;
            } catch (error) {
              logger
                .withSituation("SERVER")
                .error(
                  error,
                  `Failed to fetch candidate for element ${elem.id} lang ${languageId}`,
                );
              return null;
            }
          }),
        );

        const validCandidates = candidates.filter(
          (c): c is NonNullable<typeof c> => c !== null,
        );

        await Promise.all(
          validCandidates.map(async (candidate) =>
            executeCommand({ db }, upsertAutoTranslationEntry, {
              changesetId,
              entityId: `element:${candidate.elementId}:lang:${languageId}`,
              after: {
                text: candidate.text,
                confidence: candidate.confidence,
                source: candidate.source,
                elementId: candidate.elementId,
                languageId,
              },
            }),
          ),
        );
      } catch (error) {
        logger
          .withSituation("SERVER")
          .error(
            error,
            `Auto-translate pipeline failed for language ${languageId}`,
          );
      }
    }),
  );

  void documentId; // referenced by input for future use (e.g., filtering by document)
};
