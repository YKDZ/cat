import { defineWorkflow } from "@/core";
import { getDrizzleDB, translation } from "@cat/db";
import { zip } from "@cat/shared/utils";
import z from "zod";
import { createTranslatableStringTask } from "./create-translatable-string";

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
  vectorizerId: z.int().optional(),
  vectorStorageId: z.int().optional(),
});

export const CreateTranslationOutputSchema = z.object({
  translationIds: z.array(z.int()),
  memoryIds: z.array(z.uuidv4()),
});

export const createTranslationWorkflow = await defineWorkflow({
  name: "translation.create",
  input: CreateTranslationInputSchema,
  output: CreateTranslationOutputSchema,

  dependencies: (data, { traceId }) => [
    createTranslatableStringTask.asChild(
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

  handler: async (data, { getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();
    const [stringResult] = getTaskResult(createTranslatableStringTask);

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

    return {
      translationIds: translations.map((t) => t.id),
      memoryIds: data.memoryIds,
    };
  },
});
