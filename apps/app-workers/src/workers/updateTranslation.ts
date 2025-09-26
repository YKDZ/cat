import {
  getDrizzleDB,
  insertVector,
  translation as translationTable,
  eq,
  memoryItem,
} from "@cat/db";
import { PluginRegistry, type TextVectorizer } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { getSingle } from "@cat/shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";

const { client: drizzle } = await getDrizzleDB();

const queueId = "updateTranslation";

export const updateTranslationQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { translationId, translationValue } = z
      .object({
        translationId: z.int(),
        translationValue: z.string(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const translation = getSingle(
      await drizzle
        .select({
          value: translationTable.value,
          vectorizerId: translationTable.vectorizerId,
          languageId: translationTable.languageId,
        })
        .from(translationTable)
        .where(eq(translationTable.id, translationId))
        .limit(1),
    );

    if (!translation)
      throw new Error("Translation with given id doest not exists");

    const vectorizer = await getServiceFromDBId<TextVectorizer>(
      drizzle,
      pluginRegistry,
      translation.vectorizerId,
    );

    // 开始处理翻译的嵌入并插入
    const vectors = await vectorizer.vectorize(translation.languageId, [
      { value: translationValue, meta: null },
    ]);

    const vector = getSingle(vectors);

    await drizzle.transaction(async (tx) => {
      const embeddingId = await insertVector(tx, vector);

      if (!embeddingId) throw new Error("Failed to get id of vector");

      await tx
        .update(translationTable)
        .set({
          value: translationValue,
          embeddingId,
        })
        .where(eq(translationTable.id, translationId));

      await tx
        .update(memoryItem)
        .set({
          translation: translationValue,
          translationEmbeddingId: embeddingId,
        })
        .where(eq(memoryItem.translationId, translationId));
    });
  },
  {
    ...config,
    concurrency: 50,
  },
);

registerTaskUpdateHandlers(drizzle, worker, queueId);
