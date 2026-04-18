import {
  and,
  eq,
  inArray,
  isNotNull,
  term,
  termConcept,
  termConceptToSubject,
} from "@cat/db";
import { TermDataSchema } from "@cat/shared/schema/misc";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateGlossaryTermsCommandSchema = z.object({
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
});

export type CreateGlossaryTermsCommand = z.infer<
  typeof CreateGlossaryTermsCommandSchema
>;

export type CreateGlossaryTermsResult = {
  termIds: number[];
  conceptIds: number[];
};

const getDefinitionKey = (definition: string | null | undefined) => {
  return typeof definition === "string" && definition.length > 0
    ? definition
    : null;
};

export const createGlossaryTerms: Command<
  CreateGlossaryTermsCommand,
  CreateGlossaryTermsResult
> = async (ctx, command) => {
  if (command.data.length === 0) {
    return {
      result: {
        termIds: [],
        conceptIds: [],
      },
      events: [],
    };
  }

  const definitions = [
    ...new Set(
      command.data
        .map((item) => getDefinitionKey(item.definition))
        .filter((value): value is string => value !== null),
    ),
  ];

  const existingEntries =
    definitions.length === 0
      ? []
      : await ctx.db
          .select({
            id: termConcept.id,
            definition: termConcept.definition,
          })
          .from(termConcept)
          .where(
            and(
              eq(termConcept.glossaryId, command.glossaryId),
              inArray(termConcept.definition, definitions),
              isNotNull(termConcept.definition),
            ),
          );

  const definitionToConceptId = new Map<string, number>();
  for (const entry of existingEntries) {
    if (entry.definition !== null) {
      definitionToConceptId.set(entry.definition, entry.id);
    }
  }

  const missingDefinitions = definitions.filter(
    (definition) => !definitionToConceptId.has(definition),
  );

  if (missingDefinitions.length > 0) {
    const insertedConcepts = await ctx.db
      .insert(termConcept)
      .values(
        missingDefinitions.map((definition) => ({
          definition,
          glossaryId: command.glossaryId,
        })),
      )
      .returning({
        id: termConcept.id,
        definition: termConcept.definition,
      });

    for (const entry of insertedConcepts) {
      if (entry.definition !== null) {
        definitionToConceptId.set(entry.definition, entry.id);
      }
    }
  }

  const itemsWithoutDefinition = command.data
    .map((item, index) => ({
      index,
      definition: getDefinitionKey(item.definition),
    }))
    .filter(({ definition }) => definition === null);

  const insertedAnonymousConcepts =
    itemsWithoutDefinition.length === 0
      ? []
      : await ctx.db
          .insert(termConcept)
          .values(
            itemsWithoutDefinition.map(() => ({
              glossaryId: command.glossaryId,
            })),
          )
          .returning({ id: termConcept.id });

  const anonymousIndexMap = new Map<number, number>();
  insertedAnonymousConcepts.forEach((entry, index) => {
    const source = itemsWithoutDefinition[index];
    if (source !== undefined) {
      anonymousIndexMap.set(source.index, entry.id);
    }
  });

  const conceptIds = new Set<number>();
  const subjectRows: Array<{
    termConceptId: number;
    subjectId: number;
    isPrimary: boolean;
  }> = [];
  const termRows: Array<{
    creatorId: string | null;
    text: string;
    languageId: string;
    termConceptId: number;
  }> = [];

  command.data.forEach((item, index) => {
    const definition = getDefinitionKey(item.definition);
    const conceptId =
      definition === null
        ? anonymousIndexMap.get(index)
        : definitionToConceptId.get(definition);

    if (conceptId === undefined) {
      return;
    }

    conceptIds.add(conceptId);
    termRows.push({
      creatorId: command.creatorId ?? null,
      text: item.term,
      languageId: item.termLanguageId,
      termConceptId: conceptId,
    });
    termRows.push({
      creatorId: command.creatorId ?? null,
      text: item.translation,
      languageId: item.translationLanguageId,
      termConceptId: conceptId,
    });

    item.subjectIds?.forEach((subjectId, subjectIndex) => {
      subjectRows.push({
        termConceptId: conceptId,
        subjectId,
        isPrimary: subjectIndex === 0,
      });
    });
  });

  if (termRows.length === 0) {
    return {
      result: {
        termIds: [],
        conceptIds: [...conceptIds],
      },
      events: [],
    };
  }

  const insertedTerms = await ctx.db
    .insert(term)
    .values(termRows)
    .returning({ id: term.id });

  if (subjectRows.length > 0) {
    await ctx.db
      .insert(termConceptToSubject)
      .values(subjectRows)
      .onConflictDoNothing();
  }

  const termIds = insertedTerms.map((entry) => entry.id);
  const conceptIdList = [...conceptIds];

  return {
    result: {
      termIds,
      conceptIds: conceptIdList,
    },
    events: [
      domainEvent("term:created", {
        glossaryId: command.glossaryId,
        termIds,
      }),
      ...conceptIdList.map((conceptId) =>
        domainEvent("concept:updated", { conceptId }),
      ),
    ],
  };
};
