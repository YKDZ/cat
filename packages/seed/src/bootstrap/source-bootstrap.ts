import type { ExecutorContext } from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";

import {
  createMemory,
  createMemoryItems,
  createVectorizedStrings,
  executeCommand,
} from "@cat/domain";
import {
  buildMemoryRecallVariantsOp,
  diffStructuredContentOp,
} from "@cat/operations";
import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import {
  extract,
  toCollectionPayload,
  vueI18nExtractor,
} from "@cat/source-collector";
import { resolve } from "node:path";

import type { BootstrapProfile } from "../schemas";

import { buildLocaleBridgeMaterial } from "./locale-bridge";
import { type BootstrapRunReport, writeBootstrapRunReport } from "./report";

/**
 * Input for running bootstrap source graph ingestion.
 */
export type RunBootstrapSourceGraphInput = {
  execCtx: ExecutorContext;
  pluginManager: PluginManager;
  seedDir: string;
  profileName: string;
  creatorId: string;
  projectId: string;
  sourceLanguageId: string;
  targetLanguageIds: string[];
  profile: BootstrapProfile;
  skipVectorization: boolean;
};

/**
 * Result of running bootstrap source graph ingestion.
 */
export type RunBootstrapSourceGraphResult = {
  elementIdsByRef: Record<string, number>;
  report: BootstrapRunReport;
  reportPath: string;
  memoryId: string | undefined;
};

/**
 * Run bootstrap source collection, locale bridge, and structured diff ingestion.
 *
 * @param input - Bootstrap input
 * @returns - Bootstrap result
 */
export const runBootstrapSourceGraph = async (
  input: RunBootstrapSourceGraphInput,
): Promise<RunBootstrapSourceGraphResult> => {
  if (input.profile.sourceLanguageId !== input.sourceLanguageId) {
    throw new Error(
      `Bootstrap sourceLanguageId ${input.profile.sourceLanguageId} does not match project sourceLanguage ${input.sourceLanguageId}`,
    );
  }

  for (const targetLanguageId of input.profile.targetLanguageIds) {
    if (!input.targetLanguageIds.includes(targetLanguageId)) {
      throw new Error(
        `Bootstrap target language ${targetLanguageId} is not configured on the seed project`,
      );
    }
  }

  const baseDir = resolve(input.seedDir, input.profile.source.baseDir);
  const extracted = await extract({
    globs: input.profile.source.globs,
    extractors: [vueI18nExtractor],
    baseDir,
    sourceLanguageId: input.profile.sourceLanguageId,
  });
  const sourceDiagnostics = extracted.diagnostics;
  const sourceErrors = sourceDiagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (sourceErrors.length > input.profile.source.parseFailureTolerance) {
    throw new Error(
      `Bootstrap source collection produced ${sourceErrors.length} errors, exceeding parseFailureTolerance=${input.profile.source.parseFailureTolerance}`,
    );
  }

  const payload = toCollectionPayload(
    { ...extracted, importerId: input.profile.importerId },
    {
      projectId: input.projectId,
      sourceLanguageId: input.profile.sourceLanguageId,
      sourceRootRef: input.profile.sourceRootRef,
    },
  );

  if (input.profile.failOnZeroElements && payload.elements.length === 0) {
    throw new Error(
      "Bootstrap source collection found zero elements; check baseDir/globs/extractor.",
    );
  }
  for (const element of payload.elements) {
    if (element.languageId !== input.profile.sourceLanguageId) {
      throw new Error(
        `Bootstrap element ${element.ref} has language ${element.languageId}; expected ${input.profile.sourceLanguageId}`,
      );
    }
  }

  const locale = await buildLocaleBridgeMaterial({
    seedDir: input.seedDir,
    elements: payload.elements,
    catalogs: input.profile.localeCatalogs,
    sourceLanguageId: input.profile.sourceLanguageId,
  });
  payload.evidence.push(...locale.evidence);

  const pm = resolvePluginManager(input.pluginManager);
  const vectorizer = input.skipVectorization
    ? undefined
    : firstOrGivenService(pm, "TEXT_VECTORIZER");
  const vectorStorage = input.skipVectorization
    ? undefined
    : firstOrGivenService(pm, "VECTOR_STORAGE");
  const vectorizationStatus = input.skipVectorization
    ? "skipped"
    : vectorizer && vectorStorage
      ? "enabled"
      : "unavailable";

  if (vectorizationStatus === "unavailable") {
    throw new Error(
      "[seed] Bootstrap vectorization services unavailable (TEXT_VECTORIZER or VECTOR_STORAGE not found). " +
        "Ensure the vectorizer plugin is configured, or pass --skip-vectorization to skip.",
    );
  }

  const diff = await diffStructuredContentOp({
    payload,
    vectorizerId: vectorizer?.id,
    vectorStorageId: vectorStorage?.id,
  });

  let memoryId: string | undefined;
  if (locale.memoryItems.length > 0) {
    const memory = await executeCommand(input.execCtx, createMemory, {
      name: "CAT App Locale Memory",
      creatorId: input.creatorId,
      projectIds: [input.projectId],
    });
    const createdMemoryId = memory.id;
    memoryId = createdMemoryId;

    await Promise.all(
      locale.memoryItems.map(async (item) => {
        const [sourceStringIds, translationStringIds] = await Promise.all([
          executeCommand(input.execCtx, createVectorizedStrings, {
            data: [{ text: item.source, languageId: item.sourceLanguageId }],
          }),
          executeCommand(input.execCtx, createVectorizedStrings, {
            data: [
              {
                text: item.translation,
                languageId: item.translationLanguageId,
              },
            ],
          }),
        ]);

        const sourceStringId = sourceStringIds[0];
        const translationStringId = translationStringIds[0];
        if (sourceStringId === undefined || translationStringId === undefined) {
          throw new Error("Failed to create bootstrap locale strings");
        }

        const created = await executeCommand(input.execCtx, createMemoryItems, {
          memoryId: createdMemoryId,
          items: [
            {
              translationId: null,
              translationStringId,
              sourceStringId,
              creatorId: input.creatorId,
              sourceTemplate: null,
              translationTemplate: null,
              slotMapping: null,
            },
          ],
        });
        const createdItem = created[0];
        if (!createdItem) {
          throw new Error("Failed to create bootstrap locale memory item");
        }

        await buildMemoryRecallVariantsOp({
          memoryItemId: createdItem.id,
          memoryId: createdMemoryId,
          sourceText: item.source,
          translationText: item.translation,
          sourceLanguageId: item.sourceLanguageId,
          translationLanguageId: item.translationLanguageId,
        });
      }),
    );
  }

  const report: BootstrapRunReport = {
    profileName: input.profileName,
    generatedAt: new Date().toISOString(),
    sourceRevision: process.env.GITHUB_SHA ?? null,
    source: {
      baseDir,
      globs: input.profile.source.globs,
      sourceLanguageId: input.profile.sourceLanguageId,
      elementCount: payload.elements.length,
      nodeCount: payload.nodes.length,
      relationCount: payload.relations.length,
      evidenceCount: payload.evidence.length,
    },
    locale: {
      catalogCount: input.profile.localeCatalogs.length,
      matchedElementCount: locale.matchedElementCount,
      matchedLocaleKeyCount: locale.matchedLocaleKeyCount,
      staleLocaleKeyCount: locale.staleLocaleKeyCount,
      memoryItemCount: locale.memoryItems.length,
    },
    diff: {
      addedCount: diff.addedElementIds.length,
      removedCount: diff.removedElementIds.length,
      updatedCount: diff.updatedElementIds.length,
      movedCount: diff.movedElementIds.length,
      semanticDiffIds: diff.semanticDiffIds,
    },
    optionalServices: {
      vectorization: vectorizationStatus,
      screenshots: input.profile.screenshots ? "pending" : "not-requested",
    },
    diagnostics: {
      source: sourceDiagnostics,
      locale: locale.diagnostics,
      warnings: [],
    },
  };

  const reportPath = await writeBootstrapRunReport(
    input.seedDir,
    input.profile.report.output,
    report,
  );

  return {
    elementIdsByRef: diff.elementIdsByRef,
    report,
    reportPath,
    memoryId,
  };
};
