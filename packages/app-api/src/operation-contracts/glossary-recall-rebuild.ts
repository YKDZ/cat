import {
  createOperationFailure,
  executeCommand,
  GlossaryProjectBindingError,
  requestGlossaryRecallRebuild,
} from "@cat/domain";
import { getPermissionEngine } from "@cat/permissions";
import type { OperationFailure, TaskAffectedResource } from "@cat/shared";
import * as z from "zod";

import type {
  OperationInvocationContext,
  OperationContractErrorIdentifier,
} from "./catalog.ts";
import { defineOperationContract, OperationContractError } from "./catalog.ts";

export const GlossaryRecallRebuildInputSchema = z.strictObject({
  glossaryId: z.uuidv4(),
  projectId: z.uuidv4(),
});

export const GlossaryRecallRebuildOutputSchema = z.discriminatedUnion(
  "status",
  [
    z.strictObject({ status: z.literal("NO_WORK") }),
    z.strictObject({
      status: z.literal("STARTED"),
      taskId: z.uuidv4(),
      total: z.int().positive(),
    }),
  ],
);

export type GlossaryRecallRebuildInput = z.infer<
  typeof GlossaryRecallRebuildInputSchema
>;
export type GlossaryRecallRebuildOutput = z.infer<
  typeof GlossaryRecallRebuildOutputSchema
>;

const resourcesFor = (
  input: GlossaryRecallRebuildInput,
): TaskAffectedResource[] => [
  { type: "PROJECT", id: input.projectId },
  { type: "GLOSSARY", id: input.glossaryId },
];

const hasScope = (
  scopes: string[] | null,
  resource: "glossary" | "project",
): boolean =>
  scopes === null ||
  scopes.some((scope) =>
    ["*", `${resource}:*`, `${resource}:editor`].includes(scope),
  );

const fail = async (input: {
  context: OperationInvocationContext;
  identifier: OperationContractErrorIdentifier;
  message: string;
  resources: TaskAffectedResource[];
  authorizationDecision?: OperationFailure["authorizationDecision"] | undefined;
}): Promise<never> => {
  const failure = await executeCommand(
    { db: input.context.db },
    createOperationFailure,
    {
      id: crypto.randomUUID(),
      failure: {
        code:
          input.identifier === "relationship_denied"
            ? "CAT_OPERATION_RELATIONSHIP_DENIED"
            : input.identifier === "execution_denied"
              ? "CAT_OPERATION_EXECUTION_DENIED"
              : "CAT_OPERATION_FAILED",
        message: input.message,
        severity: "ERROR",
        retryable: false,
        capability: "RECALL_DERIVATION",
        affectedResources: input.resources,
        redactionBoundary: "PUBLIC",
        ...(input.authorizationDecision === undefined
          ? {}
          : { authorizationDecision: input.authorizationDecision }),
      },
    },
  );
  throw new OperationContractError(input.identifier, input.message, {
    operationFailure: failure,
  });
};

export const glossaryRecallRebuildContract = defineOperationContract({
  name: "glossary.rebuildRecall",
  inputSchema: GlossaryRecallRebuildInputSchema,
  outputSchema: GlossaryRecallRebuildOutputSchema,
  invoke: async (
    context: OperationInvocationContext,
    input: GlossaryRecallRebuildInput,
  ): Promise<GlossaryRecallRebuildOutput> => {
    const resources = resourcesFor(input);
    try {
      if (
        !hasScope(context.auth.scopes, "glossary") ||
        !hasScope(context.auth.scopes, "project")
      ) {
        return await fail({
          context,
          identifier: "execution_denied",
          message:
            "api_key_scope_denied: glossary:editor and project:editor scopes are required",
          resources,
          authorizationDecision: "api_key_scope_denied",
        });
      }
      const permissionEngine = getPermissionEngine();
      const [canEditGlossary, canEditProject] = await Promise.all([
        permissionEngine.check(
          { ...context.auth, scopes: null },
          { type: "glossary", id: input.glossaryId },
          "editor",
        ),
        permissionEngine.check(
          { ...context.auth, scopes: null },
          { type: "project", id: input.projectId },
          "editor",
        ),
      ]);
      if (!canEditGlossary || !canEditProject) {
        return await fail({
          context,
          identifier: "relationship_denied",
          message:
            "rebac_denied: glossary and project editor relationships are required",
          resources,
        });
      }
      return await executeCommand(
        { db: context.db },
        requestGlossaryRecallRebuild,
        { ...input, actorId: context.actor.id },
      );
    } catch (error) {
      if (error instanceof OperationContractError) throw error;
      if (error instanceof GlossaryProjectBindingError) {
        return await fail({
          context,
          identifier: "relationship_denied",
          message: "Glossary is not linked to the requested project.",
          resources,
        });
      }
      return await fail({
        context,
        identifier: "operation_failed",
        message: "Glossary recall rebuild failed",
        resources,
      });
    }
  },
});
