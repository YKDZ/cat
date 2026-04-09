import { and, eq, inArray, vectorizedString } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateVectorizedStringsCommandSchema = z.object({
  chunkSetIds: z.array(z.int()).optional(),
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
});

export type CreateVectorizedStringsCommand = z.infer<
  typeof CreateVectorizedStringsCommandSchema
>;

export const createVectorizedStrings: Command<
  CreateVectorizedStringsCommand,
  number[]
> = async (ctx, command) => {
  const { chunkSetIds, data } = command;

  if (data.length === 0) {
    return {
      result: [],
      events: [],
    };
  }

  const makeKey = (languageId: string, text: string): string =>
    `${languageId}::${text}`;

  const uniqueEntries: Array<{
    key: string;
    data: (typeof data)[number];
    chunkSetId: number | null;
  }> = [];
  const seenKeys = new Set<string>();

  for (const [index, item] of data.entries()) {
    const chunkSetId = chunkSetIds?.[index] ?? null;
    const key = makeKey(item.languageId, item.text);

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    uniqueEntries.push({ key, data: item, chunkSetId });
  }

  const idMap = new Map<string, number>();

  const byLanguage = new Map<string, string[]>();
  for (const entry of uniqueEntries) {
    const values = byLanguage.get(entry.data.languageId) ?? [];
    values.push(entry.data.text);
    byLanguage.set(entry.data.languageId, values);
  }

  const existingResults = await Promise.all(
    Array.from(byLanguage.entries()).map(([languageId, values]) =>
      ctx.db
        .select({
          id: vectorizedString.id,
          value: vectorizedString.value,
          languageId: vectorizedString.languageId,
        })
        .from(vectorizedString)
        .where(
          and(
            eq(vectorizedString.languageId, languageId),
            inArray(vectorizedString.value, values),
          ),
        ),
    ),
  );

  for (const rows of existingResults) {
    for (const row of rows) {
      idMap.set(makeKey(row.languageId, row.value), row.id);
    }
  }

  const missingEntries = uniqueEntries.filter((entry) => !idMap.has(entry.key));

  if (missingEntries.length > 0) {
    const insertedRows = await ctx.db
      .insert(vectorizedString)
      .values(
        missingEntries.map((entry) => ({
          value: entry.data.text,
          languageId: entry.data.languageId,
          chunkSetId: entry.chunkSetId,
          status: entry.chunkSetId !== null ? "ACTIVE" : "PENDING_VECTORIZE",
        })),
      )
      .onConflictDoNothing()
      .returning({
        id: vectorizedString.id,
        value: vectorizedString.value,
        languageId: vectorizedString.languageId,
      });

    for (const row of insertedRows) {
      idMap.set(makeKey(row.languageId, row.value), row.id);
    }

    const stillMissing = missingEntries.filter(
      (entry) => !idMap.has(entry.key),
    );
    if (stillMissing.length > 0) {
      const missingByLanguage = new Map<string, string[]>();
      for (const entry of stillMissing) {
        const values = missingByLanguage.get(entry.data.languageId) ?? [];
        values.push(entry.data.text);
        missingByLanguage.set(entry.data.languageId, values);
      }

      const foundResults = await Promise.all(
        Array.from(missingByLanguage.entries()).map(([languageId, values]) =>
          ctx.db
            .select({
              id: vectorizedString.id,
              value: vectorizedString.value,
              languageId: vectorizedString.languageId,
            })
            .from(vectorizedString)
            .where(
              and(
                eq(vectorizedString.languageId, languageId),
                inArray(vectorizedString.value, values),
              ),
            ),
        ),
      );

      for (const rows of foundResults) {
        for (const row of rows) {
          idMap.set(makeKey(row.languageId, row.value), row.id);
        }
      }
    }
  }

  return {
    result: data.map((item) => {
      const id = idMap.get(makeKey(item.languageId, item.text));
      if (id === undefined) {
        throw new Error(
          `Failed to resolve vectorized string id for languageId: ${item.languageId}, text: ${item.text}`,
        );
      }

      return id;
    }),
    events: [],
  };
};
