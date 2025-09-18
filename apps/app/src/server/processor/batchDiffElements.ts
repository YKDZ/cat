import { getPrismaDB, insertVectors } from "@cat/db";
import { Queue, QueueEvents, Worker } from "bullmq";
import { PluginRegistry, type TextVectorizer } from "@cat/plugin-core";
import type { JSONType } from "@cat/shared/schema/json";
import {
  TranslatableElementDataSchema,
  type TranslatableElementData,
} from "@cat/shared/schema/misc";
import { logger } from "@cat/shared/utils";
import { z } from "zod";
import { isEqual } from "lodash-es";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/server/utils/worker.ts";
import {
  DistributedTaskHandler,
  type ChunkData,
  type DistributedTask,
} from "@/server/processor/chunk.ts";
import { chunk, chunkDual, getIndex } from "@/server/utils/array.ts";
import { diffArraysAndSeparate } from "@/server/utils/diff.ts";
import { getServiceFromDBId } from "@/server/utils/plugin.ts";

type NewElementMeta = {
  projectId?: string;
  creatorId?: string;
  documentId?: string;
};

const { client: prisma } = await getPrismaDB();

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
            projectId: z.ulid().optional(),
            creatorId: z.ulid().optional(),
            documentId: z.ulid().optional(),
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
      prisma,
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
  const oldElements = (
    await prisma.translatableElement.findMany({
      where: {
        id: {
          in: oldElementIds,
        },
      },
      select: {
        id: true,
        value: true,
        meta: true,
        sortIndex: true,
      },
    })
  ).map((element) => ({
    id: element.id,
    value: element.value,
    sortIndex: element.sortIndex,
    meta: element.meta as JSONType,
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
  await prisma.translatableElement.deleteMany({
    where: {
      id: {
        in: elementIds,
      },
    },
  });
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
  return await prisma.$transaction(async (tx) => {
    const elementIds = [];

    const embeddingIds = await insertVectors(tx, vectors);

    for (let i = 0; i < elements.length; i++) {
      const element = getIndex(elements, i);

      const createdElement = await tx.translatableElement.create({
        data: {
          value: element.value,
          sortIndex: element.sortIndex,
          meta: z.json().parse(element.meta) ?? {},
          embeddingId: getIndex(embeddingIds, i),
          ...newElementMeta,
        },
      });

      elementIds.push(createdElement.id);
    }

    return {
      embeddingIds,
      elementIds,
    };
  });
};

const rollbackAddedElements = async (
  elementIds: number[],
  embeddingIds: number[],
) => {
  await prisma.$transaction(async (tx) => {
    await tx.translatableElement.deleteMany({
      where: {
        id: {
          in: elementIds,
        },
      },
    });
    await tx.vector.deleteMany({
      where: {
        id: {
          in: embeddingIds,
        },
      },
    });
  });
};

registerTaskUpdateHandlers(prisma, worker, queueId);
