import { and, asc, eq, term, termConcept, termConceptToSubject } from "@cat/db";
import {
  GlossaryConceptMaterializationSchema,
  type GlossaryConceptMaterialization,
} from "@cat/shared";
import * as z from "zod";

import type { DbContext, Query } from "#/types.ts";

export const GetGlossaryTermConceptSnapshotQuerySchema = z.strictObject({
  termId: z.int().positive(),
});

export const GetGlossaryConceptMaterializationQuerySchema = z.strictObject({
  conceptId: z.int().positive(),
});

export const FindGlossaryConceptMaterializationByDefinitionQuerySchema =
  z.strictObject({
    glossaryId: z.uuidv4(),
    definition: z.string().min(1),
  });

const readGlossaryConceptMaterialization = async (
  ctx: DbContext,
  conceptId: number,
): Promise<GlossaryConceptMaterialization | null> => {
  const [concept] = await ctx.db
    .select({
      id: termConcept.id,
      glossaryId: termConcept.glossaryId,
      creatorId: termConcept.creatorId,
      definition: termConcept.definition,
    })
    .from(termConcept)
    .where(eq(termConcept.id, conceptId))
    .limit(1);
  if (!concept) return null;
  const terms = await ctx.db
    .select({
      id: term.id,
      termConceptId: term.termConceptId,
      creatorId: term.creatorId,
      text: term.text,
      languageId: term.languageId,
      type: term.type,
      status: term.status,
    })
    .from(term)
    .where(eq(term.termConceptId, concept.id));
  const subjects = await ctx.db
    .select({
      subjectId: termConceptToSubject.subjectId,
      isPrimary: termConceptToSubject.isPrimary,
    })
    .from(termConceptToSubject)
    .where(eq(termConceptToSubject.termConceptId, concept.id));
  return GlossaryConceptMaterializationSchema.parse({
    concept,
    terms: terms.sort((left, right) => left.id - right.id),
    subjects: subjects.sort((left, right) => left.subjectId - right.subjectId),
  });
};

export const getGlossaryConceptMaterialization: Query<
  z.infer<typeof GetGlossaryConceptMaterializationQuerySchema>,
  GlossaryConceptMaterialization | null
> = async (ctx, input) =>
  await readGlossaryConceptMaterialization(ctx, input.conceptId);

export const findGlossaryConceptMaterializationByDefinition: Query<
  z.infer<typeof FindGlossaryConceptMaterializationByDefinitionQuerySchema>,
  GlossaryConceptMaterialization | null
> = async (ctx, input) => {
  const [concept] = await ctx.db
    .select({ id: termConcept.id })
    .from(termConcept)
    .where(
      and(
        eq(termConcept.glossaryId, input.glossaryId),
        eq(termConcept.definition, input.definition),
      ),
    )
    .orderBy(asc(termConcept.id))
    .limit(1);
  return concept
    ? await readGlossaryConceptMaterialization(ctx, concept.id)
    : null;
};

export const getGlossaryTermConceptSnapshot: Query<
  z.infer<typeof GetGlossaryTermConceptSnapshotQuerySchema>,
  GlossaryConceptMaterialization | null
> = async (ctx, input) => {
  const [owner] = await ctx.db
    .select({ conceptId: term.termConceptId })
    .from(term)
    .where(eq(term.id, input.termId))
    .limit(1);
  if (!owner) return null;
  return await readGlossaryConceptMaterialization(ctx, owner.conceptId);
};
