import {
  assertProjectGlossaryBinding,
  createOperationFailure,
  executeCommand,
  executeQuery,
  getBranchById,
  GlossaryProjectBindingError,
} from "@cat/domain";
import { determineWriteMode, getPermissionEngine } from "@cat/permissions";
import {
  GlossaryTermWriteOperationSchema,
  RecallDerivationReferenceSchema,
  TermDataSchema,
  type OperationFailure,
  type OperationFailureInput,
  type TaskAffectedResource,
} from "@cat/shared";
import {
  BranchWriteConflictError,
  BranchWriteInactiveError,
  ensureBranchWriteContext,
} from "@cat/vcs";
import * as z from "zod";

import type {
  OperationContractErrorIdentifier,
  OperationInvocationContext,
} from "./catalog.ts";
import { defineOperationContract, OperationContractError } from "./catalog.ts";
import {
  executeAuthorizedGlossaryTermWrite,
  type AuthorizedGlossaryTermWriteResult,
} from "./glossary-term-write-executor.ts";

export const GlossaryTermWriteInputSchema = z.strictObject({
  glossaryId: z.uuidv4(),
  termsData: z.array(TermDataSchema),
  operation: GlossaryTermWriteOperationSchema,
  projectId: z.uuidv4().optional(),
  branchId: z.int().positive().optional(),
});

export const GlossaryTermWriteOutputSchema = z.object({
  derivations: z.array(RecallDerivationReferenceSchema),
  recallDerivationTaskId: z.uuidv4().optional(),
});

export type GlossaryTermWriteInput = z.infer<
  typeof GlossaryTermWriteInputSchema
>;
export type GlossaryTermWriteOutput = z.infer<
  typeof GlossaryTermWriteOutputSchema
>;

const hasRequiredProjectScope = (
  scopes: string[] | null,
  relation: string,
): boolean =>
  scopes === null ||
  scopes.some((scope) =>
    ["*", "project:*", `project:${relation}`].includes(scope),
  );

const hasRequiredGlossaryScope = (scopes: string[] | null): boolean =>
  scopes === null ||
  scopes.some((scope) =>
    ["*", "glossary:*", "glossary:editor"].includes(scope),
  );

const buildResources = (input: {
  glossaryId: string;
  projectId?: string | undefined;
}): TaskAffectedResource[] => [
  ...(input.projectId === undefined
    ? []
    : [{ type: "PROJECT" as const, id: input.projectId }]),
  { type: "GLOSSARY", id: input.glossaryId },
];

const failureDefinition = (
  identifier: OperationContractErrorIdentifier,
): Pick<
  OperationFailure,
  "code" | "severity" | "retryable" | "remediationHint" | "redactionBoundary"
> => {
  switch (identifier) {
    case "relationship_denied":
      return {
        code: "CAT_OPERATION_RELATIONSHIP_DENIED",
        severity: "ERROR",
        retryable: false,
        remediationHint:
          "Grant the required glossary or project editor relationship, then retry.",
        redactionBoundary: "PUBLIC",
      };
    case "execution_denied":
      return {
        code: "CAT_OPERATION_EXECUTION_DENIED",
        severity: "ERROR",
        retryable: false,
        remediationHint:
          "Use an allowed write mode or provide an active branch.",
        redactionBoundary: "PUBLIC",
      };
    case "invalid_input":
      return {
        code: "CAT_OPERATION_INVALID_INPUT",
        severity: "ERROR",
        retryable: false,
        remediationHint: "Correct the requested glossary write and retry.",
        redactionBoundary: "PUBLIC",
      };
    case "not_found":
      return {
        code: "CAT_OPERATION_RESOURCE_NOT_FOUND",
        severity: "ERROR",
        retryable: false,
        remediationHint: "Refresh the selected glossary or branch and retry.",
        redactionBoundary: "PUBLIC",
      };
    case "review_change_blocked":
      return {
        code: "CAT_OPERATION_REVIEW_CHANGE_BLOCKED",
        severity: "ERROR",
        retryable: false,
        remediationHint: "Resolve the active branch state, then retry.",
        redactionBoundary: "PUBLIC",
      };
    case "operation_failed":
      return {
        code: "CAT_OPERATION_FAILED",
        severity: "ERROR",
        retryable: true,
        remediationHint:
          "Retry after the underlying glossary write failure is resolved.",
        redactionBoundary: "INTERNAL",
      };
    case "canceled":
    case "dependency_unavailable":
    case "missing_capability":
    case "permission_denied":
      return {
        code: "CAT_OPERATION_FAILED",
        severity: "ERROR",
        retryable: false,
        remediationHint:
          "Retry the operation after resolving its prerequisites.",
        redactionBoundary: "PUBLIC",
      };
  }
};

const failGlossaryTermWrite = async (input: {
  context: OperationInvocationContext;
  identifier: OperationContractErrorIdentifier;
  message: string;
  resources: TaskAffectedResource[];
  authorizationDecision?: OperationFailure["authorizationDecision"] | undefined;
}): Promise<never> => {
  const definition = failureDefinition(input.identifier);
  const failure = {
    message: input.message,
    affectedResources: input.resources,
    ...definition,
    ...(input.authorizationDecision === undefined
      ? {}
      : { authorizationDecision: input.authorizationDecision }),
  } satisfies OperationFailureInput;
  const operationFailure = await executeCommand(
    { db: input.context.db },
    createOperationFailure,
    { id: crypto.randomUUID(), failure },
  );
  throw new OperationContractError(input.identifier, input.message, {
    operationFailure,
  });
};

const invokeExecutor = async (input: {
  context: OperationInvocationContext;
  contractInput: GlossaryTermWriteInput;
  projectId?: string | undefined;
  write:
    | { mode: "direct" }
    | {
        mode: "branch";
        branchId: number;
        branchChangesetId: number;
      };
}): Promise<AuthorizedGlossaryTermWriteResult> =>
  await executeAuthorizedGlossaryTermWrite(
    { db: input.context.db, actorId: input.context.actor.id },
    {
      glossaryId: input.contractInput.glossaryId,
      termsData: input.contractInput.termsData,
      operation: input.contractInput.operation,
      write:
        input.write.mode === "branch"
          ? {
              mode: "branch",
              projectId: input.projectId!,
              branchId: input.write.branchId,
              branchChangesetId: input.write.branchChangesetId,
            }
          : {
              mode: "direct",
              ...(input.projectId === undefined
                ? {}
                : { projectId: input.projectId }),
            },
    },
  );

export const glossaryTermWriteContract = defineOperationContract({
  name: "glossary.termWrite",
  inputSchema: GlossaryTermWriteInputSchema,
  outputSchema: GlossaryTermWriteOutputSchema,
  invoke: async (
    context: OperationInvocationContext,
    input: GlossaryTermWriteInput,
  ): Promise<GlossaryTermWriteOutput> => {
    const permissionEngine = getPermissionEngine();
    let projectId = input.projectId;
    let resources = buildResources({
      glossaryId: input.glossaryId,
      ...(projectId === undefined ? {} : { projectId }),
    });
    try {
      if (!hasRequiredGlossaryScope(context.auth.scopes)) {
        return await failGlossaryTermWrite({
          context,
          identifier: "execution_denied",
          message: "api_key_scope_denied: glossary:editor scope is required",
          resources,
          authorizationDecision: "api_key_scope_denied",
        });
      }
      const canEditGlossary = await permissionEngine.check(
        { ...context.auth, scopes: null },
        { type: "glossary", id: input.glossaryId },
        "editor",
      );
      if (!canEditGlossary) {
        return await failGlossaryTermWrite({
          context,
          identifier: "relationship_denied",
          message: "rebac_denied: glossary editor relationship is required",
          resources,
        });
      }

      if (input.branchId !== undefined) {
        const branch = await executeQuery({ db: context.db }, getBranchById, {
          branchId: input.branchId,
        });
        if (!branch) {
          return await failGlossaryTermWrite({
            context,
            identifier: "not_found",
            message: `Branch ${input.branchId} not found`,
            resources,
          });
        }
        if (branch.status !== "ACTIVE") {
          return await failGlossaryTermWrite({
            context,
            identifier: "review_change_blocked",
            message: `Branch ${input.branchId} is not ACTIVE (status: ${branch.status})`,
            resources: buildResources({
              glossaryId: input.glossaryId,
              projectId: branch.projectId,
            }),
          });
        }
        if (projectId !== undefined && projectId !== branch.projectId) {
          return await failGlossaryTermWrite({
            context,
            identifier: "invalid_input",
            message: `Branch ${input.branchId} does not belong to project ${projectId}`,
            resources,
          });
        }
        projectId = branch.projectId;
        resources = buildResources({
          glossaryId: input.glossaryId,
          projectId,
        });
        await assertProjectGlossaryAccess({
          context,
          projectId,
          glossaryId: input.glossaryId,
          resources,
        });
        const branchWriteContext = await ensureBranchWriteContext({
          drizzle: context.db,
          branchId: branch.id,
          branchProjectId: projectId,
        });
        if (!branchWriteContext) {
          return await failGlossaryTermWrite({
            context,
            identifier: "review_change_blocked",
            message: "Glossary branch write context could not be created",
            resources,
          });
        }
        return await invokeExecutor({
          context,
          contractInput: input,
          projectId,
          write: {
            mode: "branch",
            branchId: branch.id,
            branchChangesetId: branchWriteContext.branchChangesetId,
          },
        });
      }

      if (projectId === undefined) {
        if (input.operation === "BULK_IMPORT") {
          return await failGlossaryTermWrite({
            context,
            identifier: "invalid_input",
            message: "Bulk glossary import requires a direct project scope",
            resources,
          });
        }
        return await invokeExecutor({
          context,
          contractInput: input,
          write: { mode: "direct" },
        });
      }

      resources = buildResources({ glossaryId: input.glossaryId, projectId });
      await assertProjectGlossaryAccess({
        context,
        projectId,
        glossaryId: input.glossaryId,
        resources,
      });
      const writeMode = await determineWriteMode(
        permissionEngine,
        { ...context.auth, scopes: null },
        projectId,
      );
      if (writeMode === "no_access") {
        return await failGlossaryTermWrite({
          context,
          identifier: "execution_denied",
          message: "write_mode_denied: project editor access is required",
          resources,
          authorizationDecision: "write_mode_denied",
        });
      }
      if (writeMode === "isolation") {
        return await failGlossaryTermWrite({
          context,
          identifier: "execution_denied",
          message: "isolation_forced: branchId is required for writes",
          resources,
          authorizationDecision: "write_mode_denied",
        });
      }
      return await invokeExecutor({
        context,
        contractInput: input,
        projectId,
        write: { mode: "direct" },
      });
    } catch (error) {
      if (error instanceof OperationContractError) throw error;
      if (error instanceof GlossaryProjectBindingError) {
        return await failGlossaryTermWrite({
          context,
          identifier: "relationship_denied",
          message: "Glossary is not linked to the requested project.",
          resources,
        });
      }
      if (
        error instanceof BranchWriteConflictError ||
        error instanceof BranchWriteInactiveError
      ) {
        return await failGlossaryTermWrite({
          context,
          identifier: "review_change_blocked",
          message: error.message,
          resources,
        });
      }
      return await failGlossaryTermWrite({
        context,
        identifier: "operation_failed",
        message: "Glossary term write failed",
        resources,
      });
    }
  },
});

const assertProjectGlossaryAccess = async (input: {
  context: OperationInvocationContext;
  projectId: string;
  glossaryId: string;
  resources: TaskAffectedResource[];
}): Promise<void> => {
  const permissionEngine = getPermissionEngine();
  const canEditProject = await permissionEngine.check(
    { ...input.context.auth, scopes: null },
    { type: "project", id: input.projectId },
    "editor",
  );
  if (!canEditProject) {
    await failGlossaryTermWrite({
      context: input.context,
      identifier: "relationship_denied",
      message: "rebac_denied: project editor relationship is required",
      resources: input.resources,
    });
  }
  if (!hasRequiredProjectScope(input.context.auth.scopes, "editor")) {
    await failGlossaryTermWrite({
      context: input.context,
      identifier: "execution_denied",
      message: "api_key_scope_denied: project:editor scope is required",
      resources: input.resources,
      authorizationDecision: "api_key_scope_denied",
    });
  }
  await executeCommand({ db: input.context.db }, assertProjectGlossaryBinding, {
    glossaryId: input.glossaryId,
    projectId: input.projectId,
  });
};
