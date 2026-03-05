import {
  and,
  eq,
  getDrizzleDB,
  inArray,
  isNotNull,
  term,
  termConcept,
  termConceptToSubject,
  translatableString,
} from "@cat/db";
import { TermDataSchema } from "@cat/shared/schema/misc";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { vectorizeToChunkSetOp } from "@/operations/vectorize";
import { buildConceptVectorizationText, createStringFromData } from "@/utils";

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

export type CreateTermInput = z.infer<typeof CreateTermInputSchema>;
export type CreateTermOutput = z.infer<typeof CreateTermOutputSchema>;

/**
 * 创建术语
 *
 * 直接存储术语文本（text + languageId），然后为每个 termConcept
 * 构建结构化向量化文本并向量化。
 */
export const createTermOp = async (
  data: CreateTermInput,
  ctx?: OperationContext,
): Promise<CreateTermOutput> => {
  const { client: drizzle } = await getDrizzleDB();

  const termIds = await drizzle.transaction(async (tx) => {
    // 1. Resolve or create termConcepts by definition
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
    for (const e of existingEntries) {
      if (e.definition !== null) {
        entryMap.set(e.definition, e.id);
      }
    }

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
      for (const e of inserted) {
        if (e.definition !== null) {
          entryMap.set(e.definition, e.id);
        }
      }
    }

    // Items without a definition get their own concept each
    const itemsWithoutDefinition = data.data
      .map((d, i) => ({ ...d, originalIndex: i }))
      .filter((d) => !d.definition);

    const noDefEntryIds =
      itemsWithoutDefinition.length > 0
        ? await tx
            .insert(termConcept)
            .values(
              itemsWithoutDefinition.map(() => ({
                glossaryId: data.glossaryId,
              })),
            )
            .returning({ id: termConcept.id })
        : [];

    const indexToEntryId = new Map<number, number>();
    noDefEntryIds.forEach((entry, idx) => {
      indexToEntryId.set(itemsWithoutDefinition[idx].originalIndex, entry.id);
    });

    // 2. Insert term rows (text + languageId directly, no translatableString)
    const termRows: {
      creatorId: string | undefined;
      text: string;
      languageId: string;
      termConceptId: number;
    }[] = [];

    const conceptIdsSet = new Set<number>();

    for (let i = 0; i < data.data.length; i += 1) {
      const item = data.data[i];
      let entryId: number | undefined;

      if (item.definition) {
        entryId = entryMap.get(item.definition);
      } else {
        entryId = indexToEntryId.get(i);
      }

      if (!entryId) continue;

      conceptIdsSet.add(entryId);

      // Source term
      termRows.push({
        creatorId: data.creatorId,
        text: item.term,
        languageId: item.termLanguageId,
        termConceptId: entryId,
      });
      // Translation term
      termRows.push({
        creatorId: data.creatorId,
        text: item.translation,
        languageId: item.translationLanguageId,
        termConceptId: entryId,
      });
    }

    if (termRows.length === 0) return [];

    const ids = await tx
      .insert(term)
      .values(termRows)
      .returning({ id: term.id });

    // 3. Insert M:N subject relations
    const subjectInserts: {
      termConceptId: number;
      subjectId: number;
      isPrimary: boolean;
    }[] = [];

    for (const item of data.data) {
      let entryId: number | undefined;
      if (item.definition) {
        entryId = entryMap.get(item.definition);
      }
      if (!entryId) continue;

      if (item.subjectIds && item.subjectIds.length > 0) {
        for (let j = 0; j < item.subjectIds.length; j += 1) {
          subjectInserts.push({
            termConceptId: entryId,
            subjectId: item.subjectIds[j],
            isPrimary: j === 0, // First subject is primary
          });
        }
      }
    }

    if (subjectInserts.length > 0) {
      await tx
        .insert(termConceptToSubject)
        .values(subjectInserts)
        .onConflictDoNothing();
    }

    return ids.map((i) => i.id);
  });

  // 4. Build concept vectorization text and vectorize for each affected concept
  // Re-fetch concept IDs from the created terms
  const createdTermRows = termIds.length
    ? await drizzle
        .select({
          termConceptId: term.termConceptId,
        })
        .from(term)
        .where(inArray(term.id, termIds))
    : [];

  const conceptIdsToVectorize = [
    ...new Set(createdTermRows.map((r) => r.termConceptId)),
  ];

  const vectorizeOneConcept = async (conceptId: number) => {
    const vectorText = await buildConceptVectorizationText(drizzle, conceptId);

    if (vectorText === null) return;

    // Check if concept already has a stringId
    const conceptRow = await drizzle
      .select({ stringId: termConcept.stringId })
      .from(termConcept)
      .where(eq(termConcept.id, conceptId))
      .limit(1);

    if (conceptRow.length > 0 && conceptRow[0].stringId !== null) {
      // Check if text changed
      const existingString = await drizzle
        .select({ value: translatableString.value })
        .from(translatableString)
        .where(eq(translatableString.id, conceptRow[0].stringId))
        .limit(1);

      if (existingString.length > 0 && existingString[0].value === vectorText) {
        return; // No change, skip re-vectorization
      }
    }

    // Vectorize and create translatableString
    const { chunkSetIds } = await vectorizeToChunkSetOp(
      {
        data: [{ text: vectorText, languageId: "mul" }],
        vectorizerId: data.vectorizerId,
        vectorStorageId: data.vectorStorageId,
      },
      ctx,
    );

    await drizzle.transaction(async (tx) => {
      const [stringId] = await createStringFromData(tx, chunkSetIds, [
        { text: vectorText, languageId: "mul" },
      ]);

      await tx
        .update(termConcept)
        .set({ stringId })
        .where(eq(termConcept.id, conceptId));
    });
  };

  await Promise.all(conceptIdsToVectorize.map(vectorizeOneConcept));

  return { termIds };
};
