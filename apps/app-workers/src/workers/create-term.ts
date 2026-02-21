import { defineWorkflow } from "@/core";
import { createStringFromData } from "@cat/app-server-shared/utils";
import {
  and,
  eq,
  getDrizzleDB,
  inArray,
  isNotNull,
  term,
  termConcept,
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

      const definitions = [
        ...new Set(
          data.data
            .map((d) => d.definition)
            .filter((s): s is string => typeof s === "string"),
        ),
      ];

      const existingEntries = definitions.length
        ? await tx
            .select({ id: termConcept.id, definition: termConcept.definition })
            .from(termConcept)
            .where(
              and(
                eq(termConcept.glossaryId, data.glossaryId),
                inArray(termConcept.definition, definitions),
                isNotNull(termConcept.definition),
              ),
            )
        : [];

      const entryMap = new Map<string, number>();
      existingEntries.forEach((e) => entryMap.set(e.definition, e.id));

      const missingDefinitions = definitions.filter((s) => !entryMap.has(s));

      if (missingDefinitions.length > 0) {
        const inserted = await tx
          .insert(termConcept)
          .values(
            missingDefinitions.map((definition) => ({
              definition,
              glossaryId: data.glossaryId,
            })),
          )
          .returning({
            id: termConcept.id,
            definition: termConcept.definition,
          });
        inserted.forEach((e) => entryMap.set(e.definition, e.id));
      }

      const itemsWithoutSubject = data.data
        .map((d, i) => ({ ...d, originalIndex: i }))
        .filter((d) => !d.definition);

      const noSubjectEntryIds =
        itemsWithoutSubject.length > 0
          ? await tx
              .insert(termConcept)
              .values(
                itemsWithoutSubject.map(() => ({
                  glossaryId: data.glossaryId,
                })),
              )
              .returning({ id: termConcept.id })
          : [];

      const indexToEntryId = new Map<number, number>();
      noSubjectEntryIds.forEach((entry, idx) => {
        indexToEntryId.set(itemsWithoutSubject[idx].originalIndex, entry.id);
      });

      const termRows = [];
      for (let i = 0; i < data.data.length; i += 1) {
        const item = data.data[i];
        let entryId: number | undefined;

        if (item.definition) {
          entryId = entryMap.get(item.definition);
        } else {
          entryId = indexToEntryId.get(i);
        }

        if (!entryId) continue;

        termRows.push({
          creatorId: data.creatorId,
          stringId: termStringIds[i],
          termConceptId: entryId,
        });
        termRows.push({
          creatorId: data.creatorId,
          stringId: translationStringIds[i],
          termConceptId: entryId,
          termConceptSubjectId: 1,
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
