import type { AuthNodeExecutor } from "../types.ts";

/**
 * identity_resolver — look up user identity from the identifier stored on
 * the blackboard. Sets `identity` and `nodeOutputs.<nodeId>.userFound`.
 * Delegates to the database via `ctx.services.db`.
 *
 * This executor is a structural placeholder. Actual DB lookup is wired in
 * the app layer when the scheduler is configured.
 */
export const identityResolverExecutor: AuthNodeExecutor = async (
  ctx,
  nodeDef,
) => {
  // oxlint-disable-next-line no-unsafe-type-assertion
  const identifierOutput = ctx.blackboard.nodeOutputs["collect-identifier"] as
    | Record<string, unknown>
    | undefined;
  const identifier =
    typeof identifierOutput?.identifier === "string"
      ? identifierOutput.identifier
      : typeof identifierOutput?.email === "string"
        ? identifierOutput.email
        : null;

  if (!identifier) {
    return {
      updates: {},
      status: "failed",
      error: {
        code: "IDENTIFIER_MISSING",
        message: "No identifier found on blackboard",
      },
    };
  }

  // Stub — actual DB lookup provided by the app-layer executor override.
  return {
    updates: {
      [`nodeOutputs.${nodeDef.id}`]: { userFound: false, identifier },
      "identity.identifier": identifier,
    },
    status: "advance",
  };
};
