import { insertVectors } from "@cat/db";
import {
  PluginRegistry,
  type TextVectorizer,
  type TranslatableFileHandler,
} from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import { isEqual } from "lodash-es";
import z from "zod";
import { getPrismaDB } from "@cat/db";
import { FileSchema, type File } from "@cat/shared/schema/prisma/file";
import type { TranslatableElementData } from "@cat/shared/schema/misc";
import type { JSONType } from "@cat/shared/schema/json";
import { logger } from "@cat/shared/utils";
import {
  DocumentSchema,
  type Document,
} from "@cat/shared/schema/prisma/document";
import { config } from "./config.ts";
import {
  DistributedTaskHandler,
  type ChunkData,
  type DistributedTask,
} from "./chunk.ts";
import { diffArraysAndSeparate } from "@/server/utils/diff.ts";
import { registerTaskUpdateHandlers } from "@/server/utils/worker.ts";
import { useStorage } from "@/server/utils/storage/useStorage.ts";
import { chunk, chunkDual, getIndex } from "@/server/utils/array.ts";
import { getServiceFromDBId } from "@/server/utils/plugin.ts";

const { client: prisma } = await getPrismaDB();

const queueId = "documentFromFilePretreatment";

export const documentFromFilePretreatmentQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { sourceLanguageId, file, document, handlerId, vectorizerId } = z
      .object({
        sourceLanguageId: z.string(),
        file: FileSchema,
        document: DocumentSchema,
        handlerId: z.int(),
        vectorizerId: z.int(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const handler = await getServiceFromDBId<TranslatableFileHandler>(
      prisma,
      pluginRegistry,
      handlerId,
    );
    const vectorizer = await getServiceFromDBId<TextVectorizer>(
      prisma,
      pluginRegistry,
      vectorizerId,
    );

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
  const { provider } = await useStorage(
    prisma,
    "s3-storage-provider",
    "S3",
    "GLOBAL",
    "",
  );

  const fileContent = await provider.getContent(file);

  const newElements = sortAndAssignIndex(
    handler.extractElement(file, fileContent),
  );

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

  const { added, removed: removedElements } = diffArraysAndSeparate(
    oldElements,
    newElements,
    (a, b) => a.value === b.value && isEqual(a.meta, b.meta),
  ) as {
    added: (TranslatableElementData & { sortIndex: number })[];
    removed: TranslatableElementData[];
  };

  const addedElements = added.map((element) => ({
    value: element.value,
    sortIndex: element.sortIndex,
    meta: element.meta as JSONType,
    documentId: document.id,
  }));

  const vectors = await vectorizer.vectorize(sourceLanguageId, addedElements);
  if (!vectors) {
    logger.warn("PROCESSOR", {
      msg: `Vectorizer ${vectorizer.getId()} does not return vectors.`,
    });
    return;
  }

  const documentVersion = await prisma.documentVersion.findFirst({
    where: {
      documentId: document.id,
      isActive: true,
    },
  });

  if (!documentVersion) {
    logger.warn("PROCESSOR", {
      msg: "Document do not have any active version.",
    });
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
            equals: z.json().parse(meta) ?? {},
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
      const element = getIndex(elements, i);

      const existing = await tx.translatableElement.findFirst({
        where: {
          documentId,
          meta: {
            equals: z.json().parse(element.meta) ?? {},
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
          meta: z.json().parse(element.meta) ?? {},
          documentId,
          embeddingId: getIndex(embeddingIds, i),
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

registerTaskUpdateHandlers(prisma, worker, queueId);
