import {
  eq,
  getDrizzleDB,
  memoryItem,
  translatableElement,
  translation as translationTable,
  vector,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { vectorizeWithGivenVectorizer } from "@cat/app-server-shared/utils";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";

const { client: drizzle } = await getDrizzleDB();

const queueId = "createTranslation";

export const createTranslationQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const {
      translationValue,
      translationLanguageId,
      elementId,
      creatorId,
      createMemory,
      memoryIds,
    } = z
      .object({
        translationValue: z.string(),
        translationLanguageId: z.string(),
        elementId: z.number(),
        creatorId: z.uuidv7(),
        createMemory: z.boolean(),
        memoryIds: z.array(z.uuidv7()),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const element = assertSingleNonNullish(
      await drizzle
        .select({
          value: translatableElement.value,
          embeddingId: translatableElement.embeddingId,
          vectorizerId: vector.vectorizerId,
          languageId: translatableElement.languageId,
        })
        .from(translatableElement)
        .innerJoin(vector, eq(translatableElement.embeddingId, vector.id))
        .where(eq(translatableElement.id, elementId))
        .limit(1),
    );

    if (!element)
      throw new Error("TranslatableElement with given id doest not exists");

    // 开始处理翻译的嵌入并插入
    const embeddingId = assertSingleNonNullish(
      await vectorizeWithGivenVectorizer(
        drizzle,
        pluginRegistry,
        element.vectorizerId,
        [
          {
            value: translationValue,
            languageId: translationLanguageId,
          },
        ],
      ),
    );

    await drizzle.transaction(async (tx) => {
      const translation = assertSingleNonNullish(
        await drizzle
          .insert(translationTable)
          .values([
            {
              value: translationValue,
              translatorId: creatorId,
              embeddingId,
              languageId: translationLanguageId,
              translatableElementId: elementId,
            },
          ])
          .returning({
            id: translationTable.id,
            value: translationTable.value,
          }),
      );

      if (createMemory && memoryIds.length > 0) {
        await tx.insert(memoryItem).values(
          memoryIds.map((memoryId) => ({
            source: element.value,
            sourceLanguageId: element.languageId,
            translation: translation.value,
            translationLanguageId,
            sourceElementId: elementId,
            translationId: translation.id,
            memoryId,
            creatorId,
            sourceEmbeddingId: element.embeddingId,
            translationEmbeddingId: embeddingId,
          })),
        );
      }
    });
  },
  {
    ...config,
    concurrency: 50,
  },
);

registerTaskUpdateHandlers(drizzle, worker, queueId);
