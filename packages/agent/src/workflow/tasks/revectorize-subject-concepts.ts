import { listTermConceptIdsBySubject } from "@cat/domain";
import * as z from "zod/v4";

import { runAgentQuery } from "@/db/domain";
import { defineGraphTask } from "@/workflow/define-task";

import { revectorizeConceptTask } from "./revectorize-concept";

export const RevectorizeSubjectConceptsInputSchema = z.object({
  subjectId: z.int(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const RevectorizeSubjectConceptsOutputSchema = z.object({
  processedCount: z.int(),
});

export const revectorizeSubjectConceptsTask = defineGraphTask({
  name: "term.revectorize-subject-concepts",
  input: RevectorizeSubjectConceptsInputSchema,
  output: RevectorizeSubjectConceptsOutputSchema,
  handler: async (payload) => {
    const conceptIds = await runAgentQuery(listTermConceptIdsBySubject, {
      subjectId: payload.subjectId,
    });

    await Promise.all(
      conceptIds.map(async (conceptId) => {
        await revectorizeConceptTask.run({
          conceptId,
          vectorizerId: payload.vectorizerId,
          vectorStorageId: payload.vectorStorageId,
        });
      }),
    );

    return { processedCount: conceptIds.length };
  },
});
