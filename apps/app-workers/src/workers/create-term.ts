import { defineWorkflow } from "@/core";
import { createStringFromData } from "@cat/app-server-shared/utils";
import {
  and,
  eq,
  getDrizzleDB,
  inArray,
  isNotNull,
  term,
  termEntry,
} from "@cat/db";
import { TermDataSchema } from "@cat/shared/schema/misc";
import * as z from "zod";
import { vectorizeToChunkSetTask } from "./vectorize";

export const CreateTermInputSchema = z.object({
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateTermOutputSchema = z.object({
  termIds: z.array(z.int()),
});

export const createTermTask = await defineWorkflow({
  name: "term.create",
  input: CreateTermInputSchema,
  output: CreateTermOutputSchema,

  dependencies: async (payload, { traceId }) => [
    await vectorizeToChunkSetTask.asChild(
      {
        data: payload.data.flatMap((d) => [
          {
            text: d.term,
            languageId: d.termLanguageId,
          },
          {
            text: d.translation,
            languageId: d.translationLanguageId,
          },
        ]),
        vectorizerId: payload.vectorizerId,
        vectorStorageId: payload.vectorStorageId,
      },
      { traceId },
    ),
  ],

  handler: async (data, { getTaskResult }) => {
    const { client: drizzle } = await getDrizzleDB();

    const [{ chunkSetIds }] = getTaskResult(vectorizeToChunkSetTask);

    const termChunkIds = chunkSetIds.filter((_, index) => index % 2 === 0);
    const translationChunkIds = chunkSetIds.filter(
      (_, index) => index % 2 !== 0,
    );
    const termDatas = data.data.map((term) => ({
      text: term.term,
      languageId: term.termLanguageId,
    }));
    const translationDatas = data.data.map((term) => ({
      text: term.translation,
      languageId: term.translationLanguageId,
    }));

    const termIds = await drizzle.transaction(async (tx) => {
      const termStringIds = await createStringFromData(
        tx,
        termChunkIds,
        termDatas,
      );

      const translationStringIds = await createStringFromData(
        tx,
        translationChunkIds,
        translationDatas,
      );

      const subjects = [
        ...new Set(
          data.data
            .map((d) => d.subject)
            .filter((s): s is string => s !== null),
        ),
      ];

      const existingEntries = subjects.length
        ? await tx
            .select({ id: termEntry.id, subject: termEntry.subject })
            .from(termEntry)
            .where(
              and(
                eq(termEntry.glossaryId, data.glossaryId),
                inArray(termEntry.subject, subjects),
                isNotNull(termEntry.subject),
              ),
            )
        : [];

      const entryMap = new Map<string, number>();
      existingEntries.forEach((e) => entryMap.set(e.subject!, e.id));

      const missingSubjects = subjects.filter((s) => !entryMap.has(s));

      if (missingSubjects.length > 0) {
        const inserted = await tx
          .insert(termEntry)
          .values(
            missingSubjects.map((subject) => ({
              subject,
              glossaryId: data.glossaryId,
            })),
          )
          .returning({ id: termEntry.id, subject: termEntry.subject });
        inserted.forEach((e) => entryMap.set(e.subject!, e.id));
      }

      const termRows = [];
      for (let i = 0; i < data.data.length; i += 1) {
        const item = data.data[i];
        if (!item.subject) continue;
        const entryId = entryMap.get(item.subject);
        if (!entryId) continue;

        termRows.push({
          creatorId: data.creatorId,
          stringId: termStringIds[i],
          termEntryId: entryId,
        });
        termRows.push({
          creatorId: data.creatorId,
          stringId: translationStringIds[i],
          termEntryId: entryId,
        });
      }

      if (termRows.length > 0) {
        const ids = await tx
          .insert(term)
          .values(termRows)
          .returning({ id: term.id });
        return ids.map((i) => i.id);
      }
      return [];
    });

    return { termIds };
  },
});
