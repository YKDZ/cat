import type { OperationContext } from "@cat/domain";

import { serverLogger as logger } from "@cat/server-shared";
import { MemorySuggestionSchema, type MemorySuggestion } from "@cat/shared";
import * as z from "zod";

import {
  CollectMemoryRecallInputSchema,
  collectMemoryRecallOp,
} from "./collect-memory-recall";

/**
 * @zh 有效记忆集合召回输入（拆分项目记忆与个人记忆）。
 * @en Effective memory recall input with separated project and personal memory IDs.
 */
export const CollectEffectiveMemoryRecallInputSchema =
  CollectMemoryRecallInputSchema.omit({ memoryIds: true }).extend({
    projectMemoryIds: z.array(z.uuidv4()).default([]),
    personalMemoryIds: z.array(z.uuidv4()).default([]),
  });

/**
 * @zh 有效记忆集合召回输入。
 * @en Effective memory recall input.
 */
export type CollectEffectiveMemoryRecallInput = z.input<
  typeof CollectEffectiveMemoryRecallInputSchema
>;

const getSuggestionDedupeKey = (item: MemorySuggestion): string =>
  [
    item.translationId ?? "",
    item.source.trim().toLocaleLowerCase(),
    item.translation.trim().toLocaleLowerCase(),
    item.sourceTemplate ?? "",
    item.translationTemplate ?? "",
  ].join("\0");

/**
 * @zh 召回“项目 + 个人”有效记忆，并按项目优先规则去重。
 * @en Recall effective project+personal memories and dedupe with project-first precedence.
 *
 * @param input - {@zh 召回输入} {@en Recall input}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 合并后的记忆候选} {@en Merged memory candidates}
 */
export const collectEffectiveMemoryRecallOp = async (
  input: CollectEffectiveMemoryRecallInput,
  ctx?: OperationContext,
): Promise<z.infer<typeof MemorySuggestionSchema>[]> => {
  const parsed = CollectEffectiveMemoryRecallInputSchema.parse(input);

  const [projectResult, personalResult] = await Promise.all([
    parsed.projectMemoryIds.length > 0
      ? collectMemoryRecallOp(
          {
            ...parsed,
            memoryIds: parsed.projectMemoryIds,
            memoryScope: "PROJECT",
          },
          ctx,
        ).catch((error: unknown) => {
          logger
            .withSituation("OP")
            .error(error, "effective memory recall: project recall failed");
          return [];
        })
      : Promise.resolve([]),
    parsed.personalMemoryIds.length > 0
      ? collectMemoryRecallOp(
          {
            ...parsed,
            memoryIds: parsed.personalMemoryIds,
            memoryScope: "PERSONAL",
          },
          ctx,
        ).catch((error: unknown) => {
          logger
            .withSituation("OP")
            .warn({ error }, "effective memory recall: personal recall failed");
          return [];
        })
      : Promise.resolve([]),
  ]);

  const merged = new Map<string, z.infer<typeof MemorySuggestionSchema>>();

  for (const item of [...projectResult, ...personalResult]) {
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
