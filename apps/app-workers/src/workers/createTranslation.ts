import {
  eq,
  getDrizzleDB,
  insertVector,
  memoryItem,
  translatableElement,
  translation as translationTable,
} from "@cat/db";
import { PluginRegistry, type TextVectorizer } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { getSingle } from "@cat/shared/utils";
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
      vectorizerId,
      createMemory,
      memoryIds,
    } = z
      .object({
        translationValue: z.string(),
        translationLanguageId: z.string(),
        elementId: z.number(),
        creatorId: z.uuidv7(),
        vectorizerId: z.number(),
        createMemory: z.boolean(),
        memoryIds: z.array(z.uuidv7()),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const vectorizer = await getServiceFromDBId<TextVectorizer>(
      drizzle,
      pluginRegistry,
      vectorizerId,
    );

    const element = getSingle(
      await drizzle
        .select({
          value: translatableElement.value,
          embeddingId: translatableElement.embeddingId,
        })
        .from(translatableElement)
        .where(eq(translatableElement.id, elementId))
        .limit(1),
    );

    if (!element)
      throw new Error("TranslatableElement with given id doest not exists");

    // 开始处理翻译的嵌入并插入
    const vectors = await vectorizer.vectorize(translationLanguageId, [
      { value: translationValue, meta: null },
    ]);

    if (vectors.length !== 1) {
      throw new Error("Vectorizer does not work well");
    }

    const vector = getSingle(vectors);

    await drizzle.transaction(async (tx) => {
      const embeddingId = await insertVector(tx, vector);

      if (!embeddingId) throw new Error("Failed to get id of vector");

      const translation = getSingle(
        await drizzle
          .insert(translationTable)
          .values([
            {
              value: translationValue,
              vectorizerId,
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

      if (createMemory) {
        await tx.insert(memoryItem).values(
          memoryIds.map((memoryId) => ({
            source: element.value,
            // TODO 源语言应该成为元素的属性
            sourceLanguageId: "zh_Hans",
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
