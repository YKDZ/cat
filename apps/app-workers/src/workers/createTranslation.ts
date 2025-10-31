import {
  document,
  eq,
  getDrizzleDB,
  memoryItem,
  translatableElement,
  translatableString,
  translation as translationTable,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";
import { createStringFromData } from "@cat/app-server-shared/utils";

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

    // TODO 配置
    const vectorStorage = assertFirstNonNullish(
      await pluginRegistry.getPluginServices(drizzle, "VECTOR_STORAGE"),
    );

    // TODO 配置
    const vectorizer = assertFirstNonNullish(
      await pluginRegistry.getPluginServices(drizzle, "TEXT_VECTORIZER"),
    );

    const element = assertSingleNonNullish(
      await drizzle
        .select({
          stringId: translatableString.id,
        })
        .from(translatableElement)
        .innerJoin(
          translatableString,
          eq(translatableElement.translatableStringId, translatableString.id),
        )
        .innerJoin(document, eq(translatableElement.documentId, document.id))
        .where(eq(translatableElement.id, elementId))
        .limit(1),
    );

    if (!element)
      throw new Error("TranslatableElement with given id doest not exists");

    await drizzle.transaction(async (tx) => {
      const stringId = assertSingleNonNullish(
        await createStringFromData(
          tx,
          vectorizer.service,
          vectorizer.id,
          vectorStorage.service,
          vectorStorage.id,
          [{ value: translationValue, languageId: translationLanguageId }],
        ),
      );
      const translation = assertSingleNonNullish(
        await drizzle
          .insert(translationTable)
          .values([
            {
              translatorId: creatorId,
              translatableElementId: elementId,
              stringId,
            },
          ])
          .returning({
            id: translationTable.id,
          }),
      );

      if (createMemory && memoryIds.length > 0) {
        await tx.insert(memoryItem).values(
          memoryIds.map((memoryId) => ({
            sourceStringId: element.stringId,
            translationStringId: stringId,
            sourceElementId: elementId,
            translationId: translation.id,
            memoryId,
            creatorId,
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
