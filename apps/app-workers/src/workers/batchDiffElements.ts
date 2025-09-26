import {
  getDrizzleDB,
  inArray,
  insertVectors,
  translatableElement,
  vector,
} from "@cat/db";
import { Queue, QueueEvents, Worker } from "bullmq";
import { PluginRegistry, type TextVectorizer } from "@cat/plugin-core";
import type { JSONType } from "@cat/shared/schema/json";
import {
  TranslatableElementDataSchema,
  type TranslatableElementData,
} from "@cat/shared/schema/misc";
import { logger } from "@cat/shared/utils";
import * as z from "zod/v4";
import { isEqual } from "lodash-es";
import { chunk, chunkDual, getIndex } from "@cat/shared/utils";
import { diffArraysAndSeparate } from "@cat/app-server-shared/utils";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";
import {
  DistributedTaskHandler,
  type ChunkData,
  type DistributedTask,
} from "@/utils/chunk.ts";

type NewElementMeta = {
  projectId?: string;
  creatorId?: string;
  documentId?: string;
};

const { client: drizzle } = await getDrizzleDB();

const queueId = "batchDiffElements";

export const batchDiffElementsQueue = new Queue(queueId, config);
export const batchDiffElementsQueueEvents = new QueueEvents(queueId);

const worker = new Worker(
  queueId,
  async (job) => {
    const {
      newElementsData,
      oldElementIds,
      sourceLanguageId,
      vectorizerId,
      newElementMeta,
    } = z
      .object({
        newElementsData: z.array(
          TranslatableElementDataSchema.required({
            sortIndex: true,
          }),
        ),
        sourceLanguageId: z.string(),
        oldElementIds: z.array(z.int()),
        vectorizerId: z.int(),
        newElementMeta: z
          .object({
            projectId: z.uuidv7().optional(),
            creatorId: z.uuidv7().optional(),
            documentId: z.uuidv7().optional(),
          })
          .refine(
            (obj) =>
              obj.projectId !== undefined ||
              obj.creatorId !== undefined ||
              obj.documentId !== undefined,
            {
              message: "At least one of element host must be provided",
            },
          )
          .optional(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const vectorizer = await getServiceFromDBId<TextVectorizer>(
      drizzle,
      pluginRegistry,
      vectorizerId,
    );

    await batchDiff(
      oldElementIds,
      newElementsData,
      sourceLanguageId,
      vectorizer,
      newElementMeta,
    );
  },
  {
    ...config,
  },
);

const batchDiff = async (
  oldElementIds: number[],
  newElementsData: (TranslatableElementData & { sortIndex: number })[],
  sourceLanguageId: string,
  vectorizer: TextVectorizer,
  newElementMeta?: NewElementMeta,
) => {
  // drizzle 查询替换 prisma findMany
  const oldElements = (
    await drizzle
      .select({
        id: translatableElement.id,
        value: translatableElement.value,
        meta: translatableElement.meta,
        sortIndex: translatableElement.sortIndex,
      })
      .from(translatableElement)
      .where(inArray(translatableElement.id, oldElementIds))
      .execute()
  ).map((element) => ({
    id: element.id,
    value: element.value,
    sortIndex: element.sortIndex,
    meta: element.meta,
  }));

  const { added, removed: removedElements } = diffArraysAndSeparate(
    oldElements,
    newElementsData,
    // 值和元数据相等即视为相等
    (a, b) => a.value === b.value && isEqual(a.meta, b.meta),
  );

  const addedElements = added.map((element) => ({
    value: element.value,
    sortIndex: element.sortIndex,
    meta: element.meta as JSONType,
  }));

  const vectors = await vectorizer.vectorize(sourceLanguageId, addedElements);
  if (!vectors) {
    logger.warn("PROCESSOR", {
      msg: `Vectorizer ${vectorizer.getId()} does not return vectors.`,
    });
    return;
  }

  // 移除元素

  await new DistributedTaskHandler("batchDiffElements_removeElements", {
    chunks: chunk(removedElements, 100).map(({ index, chunk }) => {
      return {
        chunkIndex: index,
        data: chunk,
      };
    }),
    run: async ({ data }) => {
      return await handleRemovedElements(data.map(({ id }) => id));
    },
    rollback: async (_, data) => {
      const result = z.array(z.int()).parse(data);
      await rollbackRemovedElements(result);
    },
  }).run();

  // 添加元素
  type ChunkElement = {
    element: TranslatableElementData & { sortIndex: number };
    embedding: number[];
  };

  await new DistributedTaskHandler<ChunkElement>(
    "batchDiffElements_addElement",
    {
      chunks: chunkDual<
        TranslatableElementData & { sortIndex: number },
        number[]
      >(addedElements, vectors, 100).map(({ index, chunk }) => {
        return {
          chunkIndex: index,
          data: chunk.arr1.map((el, index) => ({
            element: el,
            embedding: getIndex(chunk.arr2, index),
          })),
        } satisfies ChunkData<{
          element: TranslatableElementData & { sortIndex: number };
          embedding: number[];
        }>;
      }),
      run: async ({ data }) => {
        const { embeddingIds, elementIds } = await handleAddedElements(
          data.map((element) => element.element),
          data.map((element) => element.embedding),
          newElementMeta,
        );
        return { elementIds, embeddingIds };
      },
      rollback: async (_, data) => {
        const { elementIds, embeddingIds } = z
          .object({
            elementIds: z.array(z.int()),
            embeddingIds: z.array(z.int()),
          })
          .parse(data);
        await rollbackAddedElements(elementIds, embeddingIds);
      },
    } satisfies DistributedTask<ChunkElement>,
  ).run();
};

const handleRemovedElements = async (elementIds: number[]): Promise<void> => {
  await drizzle
    .delete(translatableElement)
    .where(inArray(translatableElement.id, elementIds));
};

const rollbackRemovedElements = async (elementIds: number[]): Promise<void> => {
  throw new Error(`Not implemented ${elementIds}`);
};

const handleAddedElements = async (
  elements: (TranslatableElementData & { sortIndex: number })[],
  vectors: number[][],
  newElementMeta?: NewElementMeta,
): Promise<{
  embeddingIds: number[];
  elementIds: number[];
}> => {
  return await drizzle.transaction(async (tx) => {
    const elementIds: number[] = [];
    const embeddingIds = await insertVectors(tx, vectors);

    for (let i = 0; i < elements.length; i++) {
      const element = getIndex(elements, i);
      const [createdElement] = await tx
        .insert(translatableElement)
        .values({
          value: element.value,
          sortIndex: element.sortIndex,
          meta: z.json().parse(element.meta) ?? {},
          embeddingId: getIndex(embeddingIds, i),
          ...newElementMeta,
        })
        .returning({ id: translatableElement.id })
        .execute();
      elementIds.push(createdElement.id);
    }
    return { embeddingIds, elementIds };
  });
};

const rollbackAddedElements = async (
  elementIds: number[],
  embeddingIds: number[],
) => {
  await drizzle.transaction(async (tx) => {
    await tx
      .delete(translatableElement)
      .where(inArray(translatableElement.id, elementIds));
    await tx.delete(vector).where(inArray(vector.id, embeddingIds));
  });
};

registerTaskUpdateHandlers(drizzle, worker, queueId);
