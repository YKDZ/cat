import type { NodeExecutor } from "@/graph/node-registry";

import { buildPatch } from "@/graph/blackboard";

import { resolvePath } from "./utils";

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
    return normalized.length > 0;
  }
  return value !== null && value !== undefined;
};

const parseExpectedValue = (raw: string): string | number | boolean | null => {
  const normalized = raw.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (normalized === "null") return null;

  const maybeNumber = Number(normalized);
  if (!Number.isNaN(maybeNumber) && normalized.length > 0) {
    return maybeNumber;
  }

  return normalized;
};

const evaluateExpression = (data: unknown, expression: string): boolean => {
  const [pathRaw, expectedRaw] = expression.split("==");
  if (!pathRaw || expectedRaw === undefined) {
    return toBoolean(resolvePath(data, expression.trim()));
  }

  const actual = resolvePath(data, pathRaw.trim());
  const expected = parseExpectedValue(expectedRaw);
  return actual === expected;
};

export const LoopNodeExecutor: NodeExecutor = async (ctx, config) => {
  const conditionPath =
    typeof config.conditionPath === "string" && config.conditionPath.length > 0
      ? config.conditionPath
      : undefined;
  const conditionExpression =
    typeof config.conditionExpression === "string" &&
    config.conditionExpression.length > 0
      ? config.conditionExpression
      : undefined;

  const continueTarget =
    typeof config.continueTarget === "string" &&
    config.continueTarget.length > 0
      ? config.continueTarget
      : "";
  const breakTarget =
    typeof config.breakTarget === "string" && config.breakTarget.length > 0
      ? config.breakTarget
      : "";

  const shouldContinue = conditionExpression
    ? evaluateExpression(ctx.snapshot.data, conditionExpression)
    : conditionPath
      ? toBoolean(resolvePath(ctx.snapshot.data, conditionPath))
      : false;

  const selectedTarget = shouldContinue ? continueTarget : breakTarget;

  if (selectedTarget.length === 0) {
    throw new Error(
      `Loop node requires continueTarget/breakTarget to resolve next node: ${ctx.nodeId}`,
    );
  }

  return {
    patch: buildPatch({
      actorId: ctx.nodeId,
      parentSnapshotVersion: ctx.snapshot.version,
      updates: {
        __nextNode: selectedTarget,
        [`${ctx.nodeId}:loop`]: {
          shouldContinue,
          selectedTarget,
          conditionPath: conditionPath ?? null,
          conditionExpression: conditionExpression ?? null,
        },
      },
    }),
    output: {
      shouldContinue,
      nextNode: selectedTarget,
    },
    status: "completed",
  };
};
