import { insertVectors } from "@cat/db";
import {
  PluginRegistry,
  type TextVectorizer,
  type TranslatableFileHandler,
} from "@cat/plugin-core";
import type {
  Document,
  File,
  JSONType,
  TranslatableElementData,
} from "@cat/shared";
import { logger } from "@cat/shared";
import type { InputJsonValue } from "@prisma/client/runtime/client";
import { Queue, Worker } from "bullmq";
import { diffArrays } from "diff";
import { isEqual } from "lodash-es";
import z from "zod";
import { chunk, chunkDual } from "../utils/array";
import { useStorage } from "../utils/storage/useStorage";
import {
  DistributedTaskHandler,
  type ChunkData,
  type DistributedTask,
} from "./chunk";
import { config } from "./config";
import { getPrismaDB } from "@cat/db";

const { client: prisma } = await getPrismaDB();

const queueId = "documentFromFilePretreatment";

export const documentFromFilePretreatmentQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const {
      sourceLanguageId,
      file,
      document,
      handlerId,
      vectorizerId,
    }: {
      id: string;
      sourceLanguageId: string;
      file: File;
      document: Document;
      handlerId: string;
      vectorizerId: string;
    } = job.data;

    const pluginRegistry = new PluginRegistry();

    await pluginRegistry.loadPlugins(prisma, {
      silent: true,
      tags: ["translatable-file-handler", "text-vectorizer"],
    });

    const handler = pluginRegistry.getTranslatableFileHandler(handlerId);

    if (!handler)
      throw new Error(`Can not find handler by given id: '${handlerId}'`);

    const vectorizer = pluginRegistry.getTextVectorizer(vectorizerId);

    if (!vectorizer)
      throw new Error(`Can not find vectorizer by given id: '${vectorizerId}'`);

    await processPretreatment(
      sourceLanguageId,
      file,
      document,
      handler,
      vectorizer,
    );
  },
  {
    ...config,
    concurrency: 50,
  },
);

export const processPretreatment = async (
  sourceLanguageId: string,
  file: File,
  document: Document,
  handler: TranslatableFileHandler,
  vectorizer: TextVectorizer,
) => {
  const {
    storage: { getContent },
  } = await useStorage();

  const fileContent = await getContent(file);

  const newElements = sortAndAssignIndex(
    handler.extractElement(file, fileContent),
  );

  const addedElements: (TranslatableElementData & {
    sortIndex: number;
    documentId: string;
  })[] = [];
  const removedElements: (TranslatableElementData & {
    sortIndex: number;
  })[] = [];

  const oldElements = (
    await prisma.translatableElement.findMany({
      where: {
        documentId: document.id,
        isActive: true,
      },
      select: {
        value: true,
        sortIndex: true,
        meta: true,
      },
    })
  ).map((element) => ({
    value: element.value,
    sortIndex: element.sortIndex,
    meta: element.meta,
  }));

  const result = diffArrays(oldElements, newElements, {
    comparator: (a, b) => a.value === b.value && isEqual(a.meta, b.meta),
  });

  result.forEach((object) => {
    if (object.added) {
      addedElements.push(
        ...object.value.map((element) => ({
          value: element.value,
          sortIndex: element.sortIndex,
          meta: element.meta as JSONType,
          documentId: document.id,
        })),
      );
    } else if (object.removed) {
      removedElements.push(
        ...(object.value as (TranslatableElementData & {
          sortIndex: number;
        })[]),
      );
    }
  });

  const vectors = await vectorizer.vectorize(sourceLanguageId, addedElements);
  if (!vectors) {
    logger.warn(
      "PROCESSER",
      `Vectorizer ${vectorizer.getId()} does not return vectors.`,
    );
    return;
  }

  const documentVersion = await prisma.documentVersion.findFirst({
    where: {
      documentId: document.id,
      isActive: true,
    },
  });

  if (!documentVersion) {
    logger.warn("PROCESSER", "Document do not have any active version.");
    return;
  }

  // 移除元素

  await new DistributedTaskHandler<TranslatableElementData>(
    "documentFromFilePretreatment_removeElements",
    {
      chunks: chunk<TranslatableElementData>(removedElements, 100).map(
        ({ index, chunk }) => {
          return {
            chunkIndex: index,
            data: chunk,
          } satisfies ChunkData<TranslatableElementData>;
        },
      ),
      run: async ({ data }) => {
        return await handleRemovedElements(data, document.id);
      },
      rollback: async (_, data) => {
        const result = z.array(z.int()).parse(data);
        await rollbackRemovedElements(result);
      },
    } satisfies DistributedTask<TranslatableElementData>,
  ).run();

  // 添加元素
  type ChunkElement = {
    element: TranslatableElementData & { sortIndex: number };
    embedding: number[];
  };

  await new DistributedTaskHandler<ChunkElement>(
    "documentFromFilePretreatment_addElement",
    {
      chunks: chunkDual<
        TranslatableElementData & { sortIndex: number },
        number[]
      >(addedElements, vectors, 100).map(({ index, chunk }) => {
        return {
          chunkIndex: index,
          data: chunk.arr1.map((el, index) => ({
            element: el,
            embedding: chunk.arr2[index],
          })),
        } satisfies ChunkData<{
          element: TranslatableElementData & { sortIndex: number };
          embedding: number[];
        }>;
      }),
      run: async ({ data }) => {
        console.log(JSON.stringify(data));
        const { embeddingIds, elementIds } = await handleAddedElements(
          data.map((element) => element.element),
          data.map((element) => element.embedding),
          document.id,
          documentVersion.id,
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

const handleRemovedElements = async (
  elements: TranslatableElementData[],
  documentId: string,
): Promise<number[]> => {
  return await prisma.$transaction(async (tx) => {
    const ids = [];
    for (const { meta } of elements) {
      // 逻辑上应该只能更新到一个元素
      const result = await tx.translatableElement.updateManyAndReturn({
        where: {
          meta: {
            equals: meta as InputJsonValue,
          },
          documentId,
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });
      if (result.length > 1)
        throw new Error("Assert failed. Should update only one element");
      ids.push(...result.map((e) => e.id));
    }
    return ids;
  });
};

const rollbackRemovedElements = async (elementIds: number[]): Promise<void> => {
  await prisma.translatableElement.updateMany({
    where: {
      id: {
        in: elementIds,
      },
    },
    data: {
      isActive: true,
    },
  });
};

const handleAddedElements = async (
  elements: (TranslatableElementData & { sortIndex: number })[],
  vectors: number[][],
  documentId: string,
  documentVersionId: number,
): Promise<{
  embeddingIds: number[];
  elementIds: number[];
}> => {
  return await prisma.$transaction(async (tx) => {
    const elementIds = [];

    const embeddingIds = await insertVectors(tx, vectors);

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];

      const existing = await tx.translatableElement.findFirst({
        where: {
          documentId,
          meta: {
            equals: element.meta as InputJsonValue,
          },
          isActive: false,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      const newVersion = existing ? existing.version + 1 : 1;

      const createdElement = await tx.translatableElement.create({
        data: {
          value: element.value,
          sortIndex: element.sortIndex,
          meta: element.meta as InputJsonValue,
          documentId,
          embeddingId: embeddingIds[i],
          version: newVersion,
          previousVersionId: existing?.id ?? null,
          isActive: true,
          documentVersionId,
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

const sortAndAssignIndex = (
  elements: TranslatableElementData[],
): (TranslatableElementData & { sortIndex: number })[] => {
  const withSortIndex: (TranslatableElementData & { sortIndex: number })[] = [];
  const withoutSortIndex: {
    item: TranslatableElementData;
    originalIndex: number;
  }[] = [];

  elements.forEach((item, idx) => {
    if (typeof item.sortIndex === "number") {
      withSortIndex.push(
        item as TranslatableElementData & { sortIndex: number },
      );
    } else {
      withoutSortIndex.push({ item, originalIndex: idx });
    }
  });

  withSortIndex.sort((a, b) => a.sortIndex! - b.sortIndex!);

  const maxSortIndex =
    withSortIndex.length > 0
      ? Math.max(...withSortIndex.map((i) => i.sortIndex!))
      : -1;

  let currentIndex = maxSortIndex + 1;
  const assignedWithoutSortIndex = withoutSortIndex
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map(({ item }) => ({
      ...item,
      sortIndex: currentIndex++,
    }));

  return [...withSortIndex, ...assignedWithoutSortIndex];
};

worker.on("active", async (job) => {
  const id = job.name;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "processing",
    },
  });

  logger.info("PROCESSER", `Active ${queueId} task: ${id}`);
});

worker.on("completed", async (job) => {
  const id = job.name;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "completed",
    },
  });

  logger.info("PROCESSER", `Completed ${queueId} task: ${id}`);
});

worker.on("failed", async (job) => {
  if (!job) return;

  const id = job.name;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "failed",
    },
  });

  logger.error("PROCESSER", `Failed ${queueId} task: ${id}`, job.stacktrace);
});

worker.on("error", async (error) => {
  logger.error("PROCESSER", `Worker throw error`, error);
});
