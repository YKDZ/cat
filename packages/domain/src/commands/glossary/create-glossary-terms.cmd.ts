import {
  and,
  eq,
  glossaryToProject,
  inArray,
  isNotNull,
  term,
  termConcept,
  termConceptToSubject,
} from "@cat/db";
import { TermDataSchema, type RecallDerivationReference } from "@cat/shared";
import * as z from "zod";

import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { registerTermConceptRecallDerivationDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { domainEvent } from "#/events/domain-events.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import { getGlossaryConceptMaterialization } from "#/queries/glossary/get-glossary-term-concept-snapshot.query.ts";
import type { Command } from "#/types.ts";

export const CreateGlossaryTermsCommandSchema = z.object({
  glossaryId: z.uuidv4(),
  projectId: z.uuidv4().optional(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
});

export type CreateGlossaryTermsCommand = z.infer<
  typeof CreateGlossaryTermsCommandSchema
>;

export type CreateGlossaryTermsResult = {
  termIds: number[];
  conceptIds: number[];
  derivations: RecallDerivationReference[];
  mutations: Array<{
    action: "CREATE" | "UPDATE";
    before: Awaited<ReturnType<typeof getGlossaryConceptMaterialization>>;
    after: NonNullable<
      Awaited<ReturnType<typeof getGlossaryConceptMaterialization>>
    >;
  }>;
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
  return await inDatabaseTransaction(ctx.db, async (tx) => {
    if (command.projectId !== undefined) {
      const [link] = await tx
        .select({ glossaryId: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(
          and(
            eq(glossaryToProject.glossaryId, command.glossaryId),
            eq(glossaryToProject.projectId, command.projectId),
          ),
        )
        .limit(1)
        .for("key share");
      if (!link)
        throw new TypeError("Glossary is not linked to the requested project.");
    }
    if (command.data.length === 0) {
      return {
        result: {
          termIds: [],
          conceptIds: [],
          derivations: [],
          mutations: [],
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
        : await tx
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
    const createdConceptIds = new Set<number>();
    for (const entry of existingEntries) {
      if (entry.definition !== null) {
        definitionToConceptId.set(entry.definition, entry.id);
      }
    }

    const missingDefinitions = definitions.filter(
      (definition) => !definitionToConceptId.has(definition),
    );

    if (missingDefinitions.length > 0) {
      const insertedConcepts = await tx
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
        createdConceptIds.add(entry.id);
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
        : await tx
            .insert(termConcept)
            .values(
              itemsWithoutDefinition.map(() => ({
                glossaryId: command.glossaryId,
              })),
            )
            .returning({ id: termConcept.id });

    const anonymousIndexMap = new Map<number, number>();
    insertedAnonymousConcepts.forEach((entry, index) => {
      createdConceptIds.add(entry.id);
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
          derivations: [],
          mutations: [],
        },
        events: [],
      };
    }

    const conceptIdList = [...conceptIds];
    await lockTermConceptRecallScopes(tx, conceptIdList);
    const beforeByConceptId = new Map(
      await Promise.all(
        conceptIdList.map(
          async (conceptId) =>
            [
              conceptId,
              await getGlossaryConceptMaterialization(
                { db: tx },
                { conceptId },
              ),
            ] as const,
        ),
      ),
    );

    const insertedTerms = await tx
      .insert(term)
      .values(termRows)
      .returning({ id: term.id });

    if (subjectRows.length > 0) {
      await tx
        .insert(termConceptToSubject)
        .values(subjectRows)
        .onConflictDoNothing();
    }

    const termIds = insertedTerms.map((entry) => entry.id);
    const derivations = await registerTermConceptRecallDerivationDemands(
      tx,
      conceptIdList,
    );

    return {
      result: {
        termIds,
        conceptIds: conceptIdList,
        derivations,
        mutations: await Promise.all(
          conceptIdList.map(async (conceptId) => {
            const after = await getGlossaryConceptMaterialization(
              { db: tx },
              { conceptId },
            );
            if (after === null) {
              throw new Error("Glossary concept disappeared during creation.");
            }
            const before = createdConceptIds.has(conceptId)
              ? null
              : (beforeByConceptId.get(conceptId) ?? null);
            return {
              action:
                before === null ? ("CREATE" as const) : ("UPDATE" as const),
              before,
              after,
            };
          }),
        ),
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
  });
};
