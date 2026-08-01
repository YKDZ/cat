import {
  executeCommand,
  executeQuery,
  getLanguageAnalysisSelection,
  LanguageAnalysisSelectionConflictError,
  listProjectLanguageAnalysisRequirements,
  listLanguageAnalysisSelections,
  readLanguageAnalysisObservation,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import { validateLanguageAnalyzerConfiguration } from "@cat/operations";
import {
  LanguageAnalysisSelectionKeySchema,
  LanguageAnalysisSelectionSchema,
  LanguageAnalysisSelectionWriteSchema,
  LanguageAnalysisObservationViewSchema,
  LanguageAnalysisWildcardSelectionKey,
  NormalizedLanguageIdSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { authed, checkPermission } from "#/orpc/server.ts";

const LANGUAGE_ANALYSIS_OBSERVATION_TTL_MS = 60_000;

export const getSelection = authed
  .input(LanguageAnalysisSelectionKeySchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(LanguageAnalysisSelectionSchema.nullable())
  .handler(async ({ context, input: key }) => {
    return await executeQuery(
      { db: context.drizzleDB.client },
      getLanguageAnalysisSelection,
      { key },
    );
  });

export const listSelections = authed
  .input(z.object({}))
  .use(checkPermission("system", "admin"), () => "*")
  .output(z.array(LanguageAnalysisSelectionSchema))
  .handler(async ({ context }) => {
    return await executeQuery(
      { db: context.drizzleDB.client },
      listLanguageAnalysisSelections,
      {},
    );
  });

export const listImplementations = authed
  .input(z.object({}))
  .use(checkPermission("system", "admin"), () => "*")
  .output(z.array(ServiceImplementationReferenceSchema))
  .handler(({ context }) =>
    context.pluginManager
      .getServices("LANGUAGE_ANALYZER")
      .map((service) =>
        context.pluginManager.createServiceImplementationReference(service),
      )
      .filter(
        (reference) =>
          reference.scopeType === "GLOBAL" && reference.scopeId === "",
      ),
  );

export const getObservation = authed
  .input(NormalizedLanguageIdSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(LanguageAnalysisObservationViewSchema)
  .handler(async ({ context, input: languageId }) => {
    return await executeQuery(
      { db: context.drizzleDB.client },
      readLanguageAnalysisObservation,
      { languageId, ttlMs: LANGUAGE_ANALYSIS_OBSERVATION_TTL_MS },
    );
  });

/** Workbench reads cached observations only; this endpoint never probes a plugin. */
export const getProjectObservations = authed
  .input(z.strictObject({ projectId: z.uuidv4() }))
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .output(z.array(LanguageAnalysisObservationViewSchema))
  .handler(async ({ context, input }) => {
    const languageIds = await executeQuery(
      { db: context.drizzleDB.client },
      listProjectLanguageAnalysisRequirements,
      { projectId: input.projectId },
    );
    return await Promise.all(
      languageIds.map(
        async (languageId) =>
          await executeQuery(
            { db: context.drizzleDB.client },
            readLanguageAnalysisObservation,
            { languageId, ttlMs: LANGUAGE_ANALYSIS_OBSERVATION_TTL_MS },
          ),
      ),
    );
  });

export const writeSelection = authed
  .input(LanguageAnalysisSelectionWriteSchema)
  .use(checkPermission("system", "admin"), () => "*")
  .output(LanguageAnalysisSelectionSchema)
  .handler(async ({ context, input }) => {
    const { drizzleDB, pluginManager, requestSignal } = context;
    const configuration =
      input.implementation === null
        ? null
        : await validateLanguageAnalyzerConfiguration(input.implementation, {
            pluginManager,
            signal: requestSignal,
            traceId: "admin-language-analysis-selection",
          });
    if (
      input.key !== LanguageAnalysisWildcardSelectionKey &&
      configuration !== null &&
      !configuration.supportedLanguages.includes(
        NormalizedLanguageIdSchema.parse(input.key),
      )
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Language Analysis implementation does not support ${input.key}`,
      });
    }

    try {
      return await executeCommand(
        { db: drizzleDB.client },
        writeValidatedLanguageAnalysisSelection,
        {
          ...input,
          configurationFingerprint:
            configuration === null ? null : configuration.fingerprint,
        },
      );
    } catch (error) {
      if (error instanceof LanguageAnalysisSelectionConflictError) {
        throw new ORPCError("CONFLICT", {
          message: "Language Analysis selection changed. Review and retry.",
        });
      }
      throw error;
    }
  });
