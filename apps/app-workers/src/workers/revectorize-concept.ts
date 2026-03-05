import {
  revectorizeConceptOp,
  RevectorizeConceptInputSchema,
  RevectorizeConceptOutputSchema,
} from "@cat/app-server-shared/operations";
import { eq, getDrizzleDB, termConceptToSubject } from "@cat/db";
import * as z from "zod";

import { defineTask } from "@/core";

export { RevectorizeConceptInputSchema, RevectorizeConceptOutputSchema };

/**
 * Revectorize a single termConcept's structured description text.
 * Triggered when definition changes, or when terms are added/removed from the concept.
 */
export const revectorizeConceptTask = await defineTask({
  name: "term.revectorize-concept",
  input: RevectorizeConceptInputSchema,
  output: RevectorizeConceptOutputSchema,
  handler: async (data, ctx) => revectorizeConceptOp(data, ctx),
});

export const RevectorizeSubjectConceptsInputSchema = z.object({
  subjectId: z.int(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const RevectorizeSubjectConceptsOutputSchema = z.object({
  processedCount: z.int(),
});

/**
 * Revectorize all termConcepts associated with a given subject.
 * Triggered when `termConceptSubject.defaultDefinition` is updated.
 * Fans out to individual `revectorizeConceptTask` calls.
 */
export const revectorizeSubjectConceptsTask = await defineTask({
  name: "term.revectorize-subject-concepts",
  input: RevectorizeSubjectConceptsInputSchema,
  output: RevectorizeSubjectConceptsOutputSchema,
  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();

    // Find all concept IDs associated with this subject
    const conceptIds = (
      await drizzle
        .select({ termConceptId: termConceptToSubject.termConceptId })
        .from(termConceptToSubject)
        .where(eq(termConceptToSubject.subjectId, data.subjectId))
    ).map((r) => r.termConceptId);

    // Enqueue revectorization for each concept
    await Promise.all(
      conceptIds.map(async (conceptId) =>
        revectorizeConceptTask.run({
          conceptId,
          vectorizerId: data.vectorizerId,
          vectorStorageId: data.vectorStorageId,
        }),
      ),
    );

    return { processedCount: conceptIds.length };
  },
});
