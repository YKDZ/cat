import type { AuthNodeExecutor } from "../types.ts";

/**
 * challenge_verifier — verify a user-provided challenge (TOTP code, OTP, etc.)
 * Delegates to the registered AUTH_FACTOR plugin for verification.
 * The factorId on the node definition selects which factor to use.
 */
export const challengeVerifierExecutor: AuthNodeExecutor = async (
  ctx,
  nodeDef,
) => {
  if (!ctx.input || Object.keys(ctx.input).length === 0) {
    return {
      updates: {},
      status: "wait_input",
      clientHint: nodeDef.clientHint,
    };
  }

  // Factor verification is delegated to the pluginManager at runtime.
  // The scheduler's nodeRegistry should have a factorId-specific executor
  // registered by the AUTH_FACTOR plugin. This is the fallback stub.
  return {
    updates: {
      [`nodeOutputs.${nodeDef.id}`]: { verified: false },
    },
    status: "failed",
    error: {
      code: "FACTOR_NOT_CONFIGURED",
      message: `No AUTH_FACTOR executor registered for factorId "${nodeDef.factorId ?? "unknown"}"`,
    },
  };
};
