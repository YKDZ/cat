import {
  findPersonalMemoryItemForTranslation,
  getTranslationMemoryPromotionContext,
  executeCommand,
  executeQuery,
  getDbHandle,
  listMemoryIdsByProject,
  recordMemoryPromotion,
} from "@cat/domain";
import * as z from "zod";

import { insertMemory } from "./memory";

/**
 * @zh 批准译文晋升到项目记忆的输入。
 * @en Input for promoting an approved translation into project memories.
 */
export const PromoteApprovedTranslationMemoryInputSchema = z.object({
  translationId: z.int(),
  approvedById: z.uuidv4(),
});

/**
 * @zh 批准译文晋升到项目记忆的输入。
 * @en Input for promoting an approved translation into project memories.
 */
export type PromoteApprovedTranslationMemoryInput = z.infer<
  typeof PromoteApprovedTranslationMemoryInputSchema
>;

/**
 * @zh 批准译文晋升结果。
 * @en Result of approved-translation promotion.
 */
export type PromoteApprovedTranslationMemoryOutput = {
  projectMemoryIds: string[];
  promotedMemoryItemIds: number[];
  noProjectMemoryTarget: boolean;
};

/**
 * @zh 将已批准译文晋升到项目记忆（幂等且可重试）。
 * @en Promote an approved translation into project memories (idempotent and retry-safe).
 *
 * @param input - {@zh 晋升输入} {@en Promotion input}
 * @returns - {@zh 晋升结果} {@en Promotion result}
 */
export const promoteApprovedTranslationMemoryOp = async (
  input: PromoteApprovedTranslationMemoryInput,
): Promise<PromoteApprovedTranslationMemoryOutput> => {
  const parsed = PromoteApprovedTranslationMemoryInputSchema.parse(input);
  const { client: db } = await getDbHandle();

  const context = await executeQuery(
    { db },
    getTranslationMemoryPromotionContext,
    {
      translationId: parsed.translationId,
    },
  );

  if (!context) {
    return {
      projectMemoryIds: [],
      promotedMemoryItemIds: [],
      noProjectMemoryTarget: true,
    };
  }

  const projectMemoryIds = await executeQuery({ db }, listMemoryIdsByProject, {
    projectId: context.projectId,
  });

  const sourcePersonalMemoryItemId =
    context.translatorId === null
      ? null
      : ((
          await executeQuery({ db }, findPersonalMemoryItemForTranslation, {
            translationId: parsed.translationId,
            projectId: context.projectId,
            userId: context.translatorId,
          })
        )?.id ?? null);

  if (projectMemoryIds.length === 0) {
    await executeCommand({ db }, recordMemoryPromotion, {
      projectId: context.projectId,
      sourceTranslationId: parsed.translationId,
      sourcePersonalMemoryItemId,
      targetMemoryId: null,
      targetMemoryItemId: null,
      approvedById: parsed.approvedById,
      status: "NO_PROJECT_MEMORY_TARGET",
      idempotencyKey: `translation:${parsed.translationId}:memory:none`,
    });

    return {
      projectMemoryIds: [],
      promotedMemoryItemIds: [],
      noProjectMemoryTarget: true,
    };
  }

  const promotedMemoryItemIds = await Promise.all(
    projectMemoryIds.map(
      async (memoryId) =>
        await db.transaction(async (tx) => {
          const result = await insertMemory(
            tx,
            [memoryId],
            [parsed.translationId],
          );
          const target = result.itemsByMemoryId.find(
            (item) => item.memoryId === memoryId,
          );
          if (!target) {
            throw new Error("project memory item was not created");
          }

          await executeCommand({ db: tx }, recordMemoryPromotion, {
            projectId: context.projectId,
            sourceTranslationId: parsed.translationId,
            sourcePersonalMemoryItemId,
            targetMemoryId: memoryId,
            targetMemoryItemId: target.memoryItemId,
            approvedById: parsed.approvedById,
            status: "PROMOTED",
            idempotencyKey: `translation:${parsed.translationId}:memory:${memoryId}`,
          });

          return target.memoryItemId;
        }),
    ),
  );

  return {
    projectMemoryIds,
    promotedMemoryItemIds,
    noProjectMemoryTarget: false,
  };
};
