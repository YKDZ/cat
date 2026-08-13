import type { OperationContext } from "@cat/domain";
import {
  EffectiveMemoryRecallResultSchema,
  EffectiveMemoryRecallStreamEventSchema,
  type EffectiveMemoryRecallResult,
  type EffectiveMemoryRecallStreamEvent,
} from "@cat/shared";
import * as z from "zod";

import { RecallOperationFailureError } from "./candidate-recall.ts";
import {
  CollectMemoryRecallInputBaseSchema,
  collectMemoryRecallOp,
  getMemoryRecallCandidates,
  type MemoryRecallCandidate,
  MemoryRecallResultSchema,
} from "./collect-memory-recall.ts";

/**
 * Effective memory recall input with separated project and personal memory IDs.
 */
export const CollectEffectiveMemoryRecallInputSchema =
  CollectMemoryRecallInputBaseSchema.omit({ memoryIds: true }).extend({
    projectMemoryIds: z.array(z.uuidv4()).default([]),
    personalMemoryIds: z.array(z.uuidv4()).default([]),
  });

/**
 * Effective memory recall input.
 */
export type CollectEffectiveMemoryRecallInput = z.input<
  typeof CollectEffectiveMemoryRecallInputSchema
>;

type EffectiveMemoryScopeOutcome =
  EffectiveMemoryRecallResult["scopes"]["PROJECT"];
export {
  EffectiveMemoryRecallResultSchema,
  EffectiveMemoryRecallStreamEventSchema,
  type EffectiveMemoryRecallResult,
  type EffectiveMemoryRecallStreamEvent,
};

const getSuggestionDedupeKey = (item: MemoryRecallCandidate): string =>
  [
    item.translationId ?? "",
    item.source.trim().toLocaleLowerCase(),
    item.translation.trim().toLocaleLowerCase(),
    item.sourceTemplate ?? "",
    item.translationTemplate ?? "",
  ].join("\0");

/**
 * Recall effective project+personal memories and dedupe with project-first precedence.
 *
 * @param input - Recall input
 * @param ctx - Operation context
 * @returns - Merged memory candidates
 */
export const collectEffectiveMemoryRecallOp = async (
  input: CollectEffectiveMemoryRecallInput,
  ctx?: OperationContext,
): Promise<EffectiveMemoryRecallResult> => {
  const parsed = CollectEffectiveMemoryRecallInputSchema.parse(input);
  const { projectMemoryIds, personalMemoryIds, ...recallInput } = parsed;

  const collectScope = async (
    memoryIds: string[],
    memoryScope: "PROJECT" | "PERSONAL",
  ): Promise<EffectiveMemoryScopeOutcome> => {
    if (memoryIds.length === 0) {
      return { status: "SKIPPED", reason: "NO_SCOPED_ASSETS" };
    }
    try {
      return {
        status: "SUCCEEDED",
        result: await collectMemoryRecallOp(
          { ...recallInput, memoryIds, memoryScope },
          ctx,
        ),
      };
    } catch (error) {
      if (!(error instanceof RecallOperationFailureError)) throw error;
      return {
        status: "BLOCKED",
        result: MemoryRecallResultSchema.parse(error.recallResult),
        failure: error.failure,
      };
    }
  };

  const [projectResult, personalResult] = await Promise.all([
    collectScope(projectMemoryIds, "PROJECT"),
    collectScope(personalMemoryIds, "PERSONAL"),
  ]);
  const result = EffectiveMemoryRecallResultSchema.parse({
    scopes: {
      PROJECT: projectResult,
      PERSONAL: personalResult,
    },
  });
  const active = [result.scopes.PROJECT, result.scopes.PERSONAL].filter(
    (scope) => scope.status !== "SKIPPED",
  );
  if (
    active.length > 0 &&
    active.every((scope) => scope.status === "BLOCKED")
  ) {
    const blocked = active.find((scope) => scope.status === "BLOCKED");
    if (!blocked) {
      throw new TypeError("Missing blocked effective Memory Recall scope.");
    }
    throw new RecallOperationFailureError(blocked.failure, blocked.result);
  }

  return result;
};

export const getEffectiveMemoryRecallCandidates = (
  result: EffectiveMemoryRecallResult,
): MemoryRecallCandidate[] => {
  const projectCandidates =
    result.scopes.PROJECT.status === "SUCCEEDED"
      ? getMemoryRecallCandidates(result.scopes.PROJECT.result)
      : [];
  const personalCandidates =
    result.scopes.PERSONAL.status === "SUCCEEDED"
      ? getMemoryRecallCandidates(result.scopes.PERSONAL.result)
      : [];

  const merged = new Map<string, MemoryRecallCandidate>();

  for (const item of [...projectCandidates, ...personalCandidates]) {
    const key = getSuggestionDedupeKey(item);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, item);
      continue;
    }

    const existingIsProject = existing.sourceScope === "PROJECT";
    const candidateIsProject = item.sourceScope === "PROJECT";

    if (existingIsProject && !candidateIsProject) {
      continue;
    }

    if (!existingIsProject && candidateIsProject) {
      merged.set(key, item);
      continue;
    }

    if (item.confidence > existing.confidence) {
      merged.set(key, item);
    }
  }

  return [...merged.values()].sort((a, b) => b.confidence - a.confidence);
};
