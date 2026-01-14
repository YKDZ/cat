import { defineWorkflow } from "@/core";
import { getDrizzleDB, getRedisDB, translation } from "@cat/db";
import { zip } from "@cat/shared/utils";
import * as z from "zod";
import { createTranslatableStringTask } from "./create-translatable-string";
import { insertMemory } from "@cat/app-server-shared/utils";
import { qaTranslationWorkflow } from "./qa-translation";

export const getCreateTranslationPubKey = (documentId: string): string => {
  return `translation:create:${documentId}`;
};

export const CreateTranslationInputSchema = z.object({
  data: z.array(
    z.object({
      translatableElementId: z.int(),
      translatorId: z.uuidv4().optional(),
      text: z.string(),
      languageId: z.string(),
      meta: z.json().optional(),
    }),
  ),
  memoryIds: z.array(z.uuidv4()).default([]),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
  /**
   * 为了 document 级 pub 做的妥协\
   * pub 为 true 时必须指定一个 documentId
   */
  documentId: z.uuidv4().optional(),
  /**
   * pub 为 true 时必须指定一个 documentId
   *
   * @default false
   */
  pub: z.boolean().default(false).optional(),
});

export const CreateTranslationOutputSchema = z.object({
  translationIds: z.array(z.int()),
  memoryItemIds: z.array(z.int()),
});

export const CreateTranslationPubPayloadSchema = z.object({
  translationIds: z.array(z.int()),
});

export type CreateTranslationPubPayload = z.infer<
  typeof CreateTranslationPubPayloadSchema
>;

export const createTranslationWorkflow = await defineWorkflow({
  name: "translation.create",
  input: CreateTranslationInputSchema,
  output: CreateTranslationOutputSchema,

  dependencies: async (data, { traceId }) => [
    await createTranslatableStringTask.asChild(
      {
        data: data.data.map((d) => ({
          text: d.text,
          languageId: d.languageId,
        })),
        vectorizerId: data.vectorizerId,
        vectorStorageId: data.vectorStorageId,
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult, traceId }) => {
    const { client: drizzle } = await getDrizzleDB();
    const { redisPub } = await getRedisDB();
    const [stringResult] = getTaskResult(createTranslatableStringTask);

    if (data.pub && !data.documentId) {
      throw new Error("documentId must be specified when pub is true");
    }

    if (!stringResult) throw new Error("Missing string creation result");

    const translations = await drizzle
      .insert(translation)
      .values(
        Array.from(zip(data.data, stringResult.stringIds)).map(
          ([item, stringId]) => ({
            ...item,
            stringId,
          }),
        ),
      )
      .returning({
        id: translation.id,
      });

    const translationIds = translations.map((t) => t.id);

    if (data.pub && data.documentId) {
      await redisPub.publish(
        getCreateTranslationPubKey(data.documentId),
        JSON.stringify({
          translationIds,
        } satisfies CreateTranslationPubPayload),
      );
    }

    let memoryItemIds: number[] | undefined;

    if (data.memoryIds.length > 0) {
      await drizzle.transaction(async (tx) => {
        memoryItemIds = (await insertMemory(tx, data.memoryIds, translationIds))
          .memoryItemIds;
      });
    }

    await Promise.all(
      translationIds.map(
        async (id) =>
          await qaTranslationWorkflow.run({ translationId: id }, { traceId }),
      ),
    );

    return {
      translationIds,
      memoryItemIds: memoryItemIds ?? [],
    };
  },
});
