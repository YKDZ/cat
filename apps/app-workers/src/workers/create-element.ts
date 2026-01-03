import { defineWorkflow } from "@/core";
import { getDrizzleDB, translatableElement } from "@cat/db";
import { zip } from "@cat/shared/utils";
import * as z from "zod";
import { createTranslatableStringTask } from "./create-translatable-string";

export const CreateElementInputSchema = z.object({
  data: z.array(
    z.object({
      meta: z.json().optional(),
      creatorId: z.uuidv4().optional(),
      documentId: z.uuidv4(),
      text: z.string(),
      languageId: z.string(),
      sortIndex: z.int().optional(),
    }),
  ),
});

export const CreateElementOutputSchema = z.object({
  elementIds: z.array(z.number()),
});

export const createElementWorkflow = await defineWorkflow({
  name: "element.create",
  input: CreateElementInputSchema,
  output: CreateElementOutputSchema,

  dependencies: (data, { traceId }) => [
    createTranslatableStringTask.asChild(
      {
        data: data.data.map((d) => ({
          text: d.text,
          languageId: d.languageId,
        })),
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();
    const [stringResult] = getTaskResult(createTranslatableStringTask);

    if (!stringResult) throw new Error("Failed to create translatable strings");

    const elements = await drizzle
      .insert(translatableElement)
      .values(
        Array.from(zip(data.data, stringResult.stringIds)).map(
          ([element, stringId]) => ({
            meta: element.meta ?? {},
            sortIndex: element.sortIndex ?? 0,
            creatorId: element.creatorId,
            documentId: element.documentId,
            translatableStringId: stringId,
          }),
        ),
      )
      .returning({
        id: translatableElement.id,
      });

    return {
      elementIds: elements.map((e) => e.id),
    };
  },
});
