import {
  getDrizzleDB,
  translation as translationTable,
  eq,
  memoryItem,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { vectorize } from "@cat/app-server-shared/utils";
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

    const translation = assertSingleNonNullish(
      await drizzle
        .select({
          value: translationTable.value,
          languageId: translationTable.languageId,
        })
        .from(translationTable)
        .where(eq(translationTable.id, translationId))
        .limit(1),
    );

    if (!translation)
      throw new Error("Translation with given id doest not exists");

    // 开始处理翻译的嵌入并插入
    const embeddingId = assertSingleNonNullish(
      await vectorize(drizzle, pluginRegistry, [
        {
          value: translationValue,
          languageId: translation.languageId,
        },
      ]),
    );

    await drizzle.transaction(async (tx) => {
      await tx
        .update(translationTable)
        .set({
          value: translationValue,
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
