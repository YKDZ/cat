import { getDrizzleDB, inArray, translatableElement, vector } from "@cat/db";
import { Queue, QueueEvents, Worker } from "bullmq";
import { PluginRegistry } from "@cat/plugin-core";
import {
  TranslatableElementDataSchema,
  type TranslatableElementData,
} from "@cat/shared/schema/misc";
import * as z from "zod/v4";
import { isEqual } from "lodash-es";
import { chunk, chunkDual, getIndex } from "@cat/shared/utils";
import { diffArraysAndSeparate, vectorize } from "@cat/app-server-shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";
import {
  DistributedTaskHandler,
  type ChunkData,
  type DistributedTask,
} from "@/utils/chunk.ts";

const { client: drizzle } = await getDrizzleDB();

const queueId = "batchDiffElements";

export const batchDiffElementsQueue = new Queue(queueId, config);
export const batchDiffElementsQueueEvents = new QueueEvents(queueId);

const worker = new Worker(
  queueId,
  async (job) => {
    const { newElementsData, oldElementIds, documentId } = z
      .object({
        newElementsData: z.array(
          TranslatableElementDataSchema.required({
            sortIndex: true,
          }),
        ),
        oldElementIds: z.array(z.int()),
        documentId: z.uuidv7(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    await batchDiff(pluginRegistry, oldElementIds, newElementsData, documentId);
  },
  {
    ...config,
  },
);

const batchDiff = async (
  pluginRegistry: PluginRegistry,
  oldElementIds: number[],
  newElementsData: (TranslatableElementData & { sortIndex: number })[],
  documentId: string,
) => {
  const oldElements = (
    await drizzle
      .select({
        id: translatableElement.id,
        value: translatableElement.value,
        meta: translatableElement.meta,
        languageId: translatableElement.languageId,
        sortIndex: translatableElement.sortIndex,
      })
      .from(translatableElement)
      .where(inArray(translatableElement.id, oldElementIds))
      .execute()
  ).map((element) => ({
    id: element.id,
    value: element.value,
    sortIndex: element.sortIndex,
    languageId: element.languageId,
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
    languageId: element.languageId,
    meta: element.meta,
  }));

  const embeddingIds = await vectorize(drizzle, pluginRegistry, addedElements);

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
    embeddingId: number;
  };

  await new DistributedTaskHandler<ChunkElement>(
    "batchDiffElements_addElement",
    {
      chunks: chunkDual<
        TranslatableElementData & { sortIndex: number },
        number
      >(addedElements, embeddingIds, 100).map(({ index, chunk }) => {
        return {
          chunkIndex: index,
          data: chunk.arr1.map((el, index) => ({
            element: el,
            embeddingId: getIndex(chunk.arr2, index),
          })),
        } satisfies ChunkData<{
          element: TranslatableElementData & { sortIndex: number };
          embeddingId: number;
        }>;
      }),
      run: async ({ data }) => {
        const elementIds = await handleAddedElements(
          data.map((element) => element.element),
          data.map((element) => element.embeddingId),
          documentId,
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
  embeddingIds: number[],
  documentId: string,
): Promise<number[]> => {
  const elementWithEmbeddingIds = elements.map((element, index) => ({
    ...element,
    embeddingId: getIndex(embeddingIds, index),
  }));

  return (
    await drizzle
      .insert(translatableElement)
      .values(
        elementWithEmbeddingIds.map((data) => {
          return {
            value: data.value,
            sortIndex: data.sortIndex,
            meta: data.meta,
            embeddingId: data.embeddingId,
            documentId,
            languageId: data.languageId,
          };
        }),
      )
      .returning({
        id: translatableElement.id,
      })
  ).map(({ id }) => id);
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
