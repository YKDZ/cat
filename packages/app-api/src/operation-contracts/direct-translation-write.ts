import { randomUUID } from "node:crypto";

import {
  createPR,
  createOperationFailure,
  executeCommand,
  executeQuery,
  getElementWithChunkIds,
  updatePR,
} from "@cat/domain";
import { writePersonalTranslationMemoryOp } from "@cat/operations";
import { determineWriteMode, getPermissionEngine } from "@cat/permissions";
import {
  selectFirstServiceImplementation,
  serverLogger as logger,
} from "@cat/server-shared";
import type {
  JSONObject,
  OperationFailure,
  RecallDerivationReference,
  TaskAffectedResource,
} from "@cat/shared";
import { JSONObjectSchema, RecallDerivationReferenceSchema } from "@cat/shared";
import type { VCSContext } from "@cat/vcs";
import { EditorOverlayTranslationStateSchema } from "@cat/vcs";
import { createTranslationGraph, runGraph } from "@cat/workflow/tasks";
import * as z from "zod";

import {
  createVCSRouteHelper,
  ensureBranchWriteContext,
} from "#/utils/vcs-route-helper.ts";

import type {
  OperationContractErrorIdentifier,
  OperationInvocationContext,
} from "./catalog.ts";
import { defineOperationContract, OperationContractError } from "./catalog.ts";

type OperationFailureDecisionFields = Pick<
  Partial<OperationFailure>,
  "authorizationDecision" | "capability" | "blocker"
>;

export const DirectTranslationWriteInputSchema = z.object({
  projectId: z.uuidv4(),
  elementId: z.int(),
  languageId: z.string(),
  text: z.string(),
  createMemory: z.boolean().default(true),
});

export const DirectTranslationWriteOutputSchema = z.object({
  translationIds: z.array(z.int()),
  memoryItemIds: z.array(z.int()),
  derivations: z.array(RecallDerivationReferenceSchema),
  writeMode: z.enum(["direct", "reviewable_change"]).default("direct"),
  reviewableChange: z
    .object({
      sourceOperation: z.literal("translation.directWrite"),
      pullRequestId: z.int(),
      pullRequestNumber: z.int(),
      status: z.string(),
      affectedTranslationUnit: z.object({
        projectId: z.uuidv4(),
        elementId: z.int(),
        languageId: z.string(),
      }),
    })
    .optional(),
});

export type DirectTranslationWriteInput = z.infer<
  typeof DirectTranslationWriteInputSchema
>;
export type DirectTranslationWriteOutput = z.infer<
  typeof DirectTranslationWriteOutputSchema
>;

const hasRequiredProjectScope = (
  scopes: string[] | null,
  relation: string,
): boolean =>
  scopes === null ||
  scopes.some((scope) =>
    ["*", "project:*", `project:${relation}`].includes(scope),
  );

const buildTranslationResources = (input: {
  projectId: string;
  elementId: number;
  translationIds?: number[];
}): TaskAffectedResource[] => [
  {
    type: "PROJECT",
    id: input.projectId,
  },
  {
    type: "ELEMENT",
    id: String(input.elementId),
  },
  ...(input.translationIds ?? []).map((translationId) => ({
    type: "TRANSLATION" as const,
    id: String(translationId),
  })),
];

const asJSONObject = (value: unknown): JSONObject =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? JSONObjectSchema.parse(value)
    : {};

const failOperationAndThrow = async (input: {
  db: OperationInvocationContext["db"];
  resources: TaskAffectedResource[];
  identifier: OperationContractErrorIdentifier;
  message: string;
  decisionFields?: OperationFailureDecisionFields | undefined;
  onOperationFailure?:
    | ((operationFailure: OperationFailure) => Promise<void>)
    | undefined;
}): Promise<never> => {
  const proposedFailure = buildOperationFailure({
    identifier: input.identifier,
    message: input.message,
    affectedResources: input.resources,
    ...(input.decisionFields === undefined
      ? {}
      : { decisionFields: input.decisionFields }),
  });
  const {
    id,
    taskId: _taskId,
    traceId: _traceId,
    ...failure
  } = proposedFailure;
  const operationFailure = await executeCommand(
    { db: input.db },
    createOperationFailure,
    { id, failure },
  );
  await input.onOperationFailure?.(operationFailure);
  throw new OperationContractError(input.identifier, input.message, {
    operationFailure,
  });
};

const buildOperationFailure = (input: {
  identifier: OperationContractErrorIdentifier;
  message: string;
  traceId?: string;
  affectedResources: TaskAffectedResource[];
  decisionFields?: OperationFailureDecisionFields;
}): OperationFailure => ({
  id: randomUUID(),
  code: getOperationFailureCode(input.identifier),
  message: input.message,
  severity: getOperationFailureSeverity(input.identifier),
  retryable: getOperationFailureRetryability(input.identifier),
  affectedResources: input.affectedResources,
  remediationHint: getOperationFailureRemediationHint(input.identifier),
  redactionBoundary: getOperationFailureRedactionBoundary(input.identifier),
  ...input.decisionFields,
});

const getOperationFailureCode = (
  identifier: OperationContractErrorIdentifier,
): OperationFailure["code"] => {
  switch (identifier) {
    case "canceled":
      return "CAT_OPERATION_CANCELED";
    case "dependency_unavailable":
      return "CAT_OPERATION_DEPENDENCY_UNAVAILABLE";
    case "execution_denied":
      return "CAT_OPERATION_EXECUTION_DENIED";
    case "invalid_input":
      return "CAT_OPERATION_INVALID_INPUT";
    case "missing_capability":
      return "CAT_OPERATION_MISSING_CAPABILITY";
    case "not_found":
      return "CAT_OPERATION_RESOURCE_NOT_FOUND";
    case "operation_failed":
      return "CAT_OPERATION_FAILED";
    case "permission_denied":
      return "CAT_OPERATION_PERMISSION_DENIED";
    case "relationship_denied":
      return "CAT_OPERATION_RELATIONSHIP_DENIED";
    case "review_change_blocked":
      return "CAT_OPERATION_REVIEW_CHANGE_BLOCKED";
  }
};

const getOperationFailureSeverity = (
  identifier: OperationContractErrorIdentifier,
): OperationFailure["severity"] => {
  switch (identifier) {
    case "canceled":
      return "WARNING";
    case "dependency_unavailable":
    case "execution_denied":
    case "invalid_input":
    case "missing_capability":
    case "not_found":
    case "operation_failed":
    case "permission_denied":
    case "relationship_denied":
    case "review_change_blocked":
      return "ERROR";
  }
};

const getOperationFailureRetryability = (
  identifier: OperationContractErrorIdentifier,
): boolean => {
  switch (identifier) {
    case "dependency_unavailable":
    case "missing_capability":
    case "operation_failed":
      return true;
    case "canceled":
    case "execution_denied":
    case "invalid_input":
    case "not_found":
    case "permission_denied":
    case "relationship_denied":
    case "review_change_blocked":
      return false;
  }
};

const getOperationFailureRemediationHint = (
  identifier: OperationContractErrorIdentifier,
): string => {
  switch (identifier) {
    case "canceled":
      return "Retry the operation if the work is still needed.";
    case "dependency_unavailable":
      return "Configure the missing localization service capability, then retry.";
    case "execution_denied":
      return "Use an execution context with the required operation scope or write mode.";
    case "invalid_input":
      return "Correct the operation input and retry.";
    case "missing_capability":
      return "Configure the missing localization service capability, then retry.";
    case "not_found":
      return "Refresh the resource selection and retry with an existing resource.";
    case "operation_failed":
      return "Review the task context and retry after the underlying issue is resolved.";
    case "permission_denied":
      return "Grant the required project permission or invoke as an authorized actor.";
    case "relationship_denied":
      return "Grant the project editor relationship or invoke as an authorized actor.";
    case "review_change_blocked":
      return "Resolve the reviewable change write context before retrying the operation.";
  }
};

const getOperationFailureRedactionBoundary = (
  identifier: OperationContractErrorIdentifier,
): OperationFailure["redactionBoundary"] => {
  switch (identifier) {
    case "operation_failed":
      return "INTERNAL";
    case "canceled":
    case "dependency_unavailable":
    case "execution_denied":
    case "invalid_input":
    case "missing_capability":
    case "not_found":
    case "permission_denied":
    case "relationship_denied":
    case "review_change_blocked":
      return "PUBLIC";
  }
};

const isAbortLikeError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;

  const name = Reflect.get(error, "name");
  return name === "AbortError";
};

const failOperationForThrownError = async (input: {
  db: OperationInvocationContext["db"];
  resources: TaskAffectedResource[];
  signal?: AbortSignal | undefined;
  error: unknown;
  decisionFields?: OperationFailureDecisionFields | undefined;
  onOperationFailure?:
    | ((operationFailure: OperationFailure) => Promise<void>)
    | undefined;
}): Promise<never> => {
  if (
    input.error instanceof OperationContractError &&
    input.error.operationFailure !== undefined
  ) {
    throw input.error;
  }

  if (input.error instanceof OperationContractError) {
    return await failOperationAndThrow({
      db: input.db,
      resources: input.resources,
      identifier: input.error.identifier,
      message: input.error.message,
      decisionFields: input.decisionFields,
      onOperationFailure: input.onOperationFailure,
    });
  }

  if (input.signal?.aborted === true || isAbortLikeError(input.error)) {
    return await failOperationAndThrow({
      db: input.db,
      resources: input.resources,
      identifier: "canceled",
      message: "Translation operation was canceled",
      decisionFields: input.decisionFields,
      onOperationFailure: input.onOperationFailure,
    });
  }

  return await failOperationAndThrow({
    db: input.db,
    resources: input.resources,
    identifier: "operation_failed",
    message: "Translation operation failed",
    decisionFields: input.decisionFields,
    onOperationFailure: input.onOperationFailure,
  });
};

export const directTranslationWriteContract = defineOperationContract({
  name: "translation.directWrite",
  inputSchema: DirectTranslationWriteInputSchema,
  outputSchema: DirectTranslationWriteOutputSchema,
  invoke: async (
    context: OperationInvocationContext,
    input: DirectTranslationWriteInput,
  ): Promise<DirectTranslationWriteOutput> => {
    const { db, actor, auth, pluginManager, signal } = context;
    const { elementId, languageId, text, createMemory } = input;

    const inputResources = buildTranslationResources({
      projectId: input.projectId,
      elementId,
    });
    let failureResources = inputResources;
    let failureDecisionFields: OperationFailureDecisionFields | undefined;
    let onOperationFailure:
      | ((operationFailure: OperationFailure) => Promise<void>)
      | undefined;
    try {
      const element = await executeQuery({ db }, getElementWithChunkIds, {
        elementId,
      });

      if (!element) {
        throw new OperationContractError(
          "not_found",
          `Element ${elementId} not found`,
        );
      }

      const permissionEngine = getPermissionEngine();
      const hasProjectEditorRelationship = await permissionEngine.check(
        {
          ...auth,
          scopes: null,
        },
        { type: "project", id: element.projectId },
        "editor",
      );

      if (!hasProjectEditorRelationship) {
        throw new OperationContractError(
          "relationship_denied",
          "rebac_denied: project editor relationship is required",
        );
      }

      if (element.projectId !== input.projectId) {
        throw new OperationContractError(
          "invalid_input",
          `Element ${elementId} does not belong to project ${input.projectId}`,
        );
      }

      const executionResources = buildTranslationResources({
        projectId: element.projectId,
        elementId,
      });
      failureResources = executionResources;

      if (!hasRequiredProjectScope(auth.scopes, "editor")) {
        await failOperationAndThrow({
          db,
          resources: executionResources,
          identifier: "execution_denied",
          message: "api_key_scope_denied: project:editor scope is required",
          decisionFields: {
            authorizationDecision: "api_key_scope_denied",
          },
        });
      }

      const writeMode = await determineWriteMode(
        permissionEngine,
        {
          ...auth,
          scopes: null,
        },
        element.projectId,
      );
      switch (writeMode) {
        case "no_access":
          return await failOperationAndThrow({
            db,
            resources: executionResources,
            identifier: "execution_denied",
            message: "write_mode_denied: project editor access is required",
            decisionFields: {
              authorizationDecision: "write_mode_denied",
            },
          });
        case "isolation": {
          const pr = await executeCommand({ db }, createPR, {
            projectId: element.projectId,
            title: `Review translation for element ${elementId}`,
            body: `Reviewable Change created by translation.directWrite for element ${elementId} (${languageId}).`,
            authorId: actor.id,
            reviewers: [],
            branchName: `reviewable-change/translation-${elementId}-${randomUUID()}`,
            metadata: {
              sourceOperation: "translation.directWrite",
              affectedTranslationUnit: {
                projectId: element.projectId,
                elementId,
                languageId,
              },
            },
          });
          const reviewableChangeResources = buildTranslationResources({
            projectId: element.projectId,
            elementId,
          });
          failureResources = reviewableChangeResources;
          failureDecisionFields = {
            blocker: "reviewable_change_write_failed",
          };
          onOperationFailure = async (operationFailure) => {
            await executeCommand({ db }, updatePR, {
              prId: pr.id,
              metadata: {
                ...asJSONObject(pr.metadata),
                operationFailure,
              },
            });
          };
          const branchWriteContext = await ensureBranchWriteContext({
            drizzle: db,
            branchId: pr.branchId,
            branchProjectId: element.projectId,
          });

          if (branchWriteContext === null) {
            return await failOperationAndThrow({
              db,
              resources: reviewableChangeResources,
              identifier: "review_change_blocked",
              message: "Reviewable Change write context could not be created",
              decisionFields: {
                blocker: "branch_write_context_unavailable",
              },
              onOperationFailure,
            });
          }

          const { middleware } = createVCSRouteHelper(db);
          const timestamp = new Date().toISOString();
          await middleware.interceptWrite(
            branchWriteContext,
            "translation",
            randomUUID(),
            "CREATE",
            null,
            {
              ...EditorOverlayTranslationStateSchema.parse({
                translatableElementId: elementId,
                languageId,
                text,
                translatorId: actor.id,
                approved: false,
                createdAt: timestamp,
                updatedAt: timestamp,
              }),
              sourceOperation: "translation.directWrite",
            },
            async () => undefined,
          );

          return {
            translationIds: [],
            memoryItemIds: [],
            derivations: [],
            writeMode: "reviewable_change",
            reviewableChange: {
              sourceOperation: "translation.directWrite",
              pullRequestId: pr.id,
              pullRequestNumber: pr.number,
              status: pr.status,
              affectedTranslationUnit: {
                projectId: element.projectId,
                elementId,
                languageId,
              },
            },
          };
        }
        case "direct":
          break;
      }

      const storage = selectFirstServiceImplementation(
        pluginManager,
        "VECTOR_STORAGE",
      );
      const vectorizer = selectFirstServiceImplementation(
        pluginManager,
        "TEXT_VECTORIZER",
      );

      if (!storage) {
        return await failOperationAndThrow({
          db,
          resources: executionResources,
          identifier: "missing_capability",
          message: "No vector storage provider available",
          decisionFields: {
            capability: "VECTOR_STORAGE",
          },
        });
      }

      if (!vectorizer) {
        return await failOperationAndThrow({
          db,
          resources: executionResources,
          identifier: "missing_capability",
          message: "No text vectorizer capability available",
          decisionFields: {
            capability: "TEXT_VECTORIZER",
          },
        });
      }

      const result = await runGraph(
        createTranslationGraph,
        {
          data: [
            {
              translatableElementId: elementId,
              text,
              languageId,
              translatorId: actor.id,
            },
          ],
          memoryIds: [],
          vectorStorage: storage.reference,
          vectorizer: vectorizer.reference,
          translatorId: actor.id,
        },
        {
          pluginManager,
          signal,
          vcsContext: {
            mode: "direct",
            projectId: element.projectId,
            createdBy: actor.id,
          } satisfies VCSContext,
          vcsMiddleware: createVCSRouteHelper(db).middleware,
        },
      );

      let memoryItemIds = result.memoryItemIds;
      let derivations: RecallDerivationReference[] = result.derivations;
      if (createMemory && result.translationIds.length > 0) {
        try {
          const personalMemory = await writePersonalTranslationMemoryOp({
            translationIds: result.translationIds,
            userId: actor.id,
            projectId: element.projectId,
          });
          memoryItemIds = [
            ...new Set([...memoryItemIds, ...personalMemory.memoryItemIds]),
          ];
          derivations = [...derivations, ...personalMemory.derivations];
        } catch (error) {
          logger
            .child({ component: "rpc" })
            .error("personal memory write failed", { error: error });
        }
      }

      return {
        translationIds: result.translationIds,
        memoryItemIds,
        derivations,
        writeMode: "direct",
      };
    } catch (error) {
      return await failOperationForThrownError({
        db,
        resources: failureResources,
        signal,
        error,
        decisionFields: failureDecisionFields,
        onOperationFailure,
      });
    }
  },
});
