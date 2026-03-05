import {
  addTermToConceptOp,
  deleteTermOp,
  streamSearchTermsOp,
  updateConceptOp,
} from "@cat/app-server-shared/operations";
import { firstOrGivenService } from "@cat/app-server-shared/utils";
import { createTermTask } from "@cat/app-workers";
import {
  count,
  eq,
  glossary as glossaryTable,
  glossaryToProject,
  document as documentTable,
  translatableElement,
  translatableString,
  getColumns,
  termConcept,
  termConceptSubject,
} from "@cat/db";
import {
  TermStatusValues,
  TermTypeValues,
} from "@cat/shared/schema/drizzle/enum";
import { GlossarySchema } from "@cat/shared/schema/drizzle/glossary";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { assertSingleNonNullish, assertSingleOrNull } from "@cat/shared/utils";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

export const deleteTerm = authed
  .input(
    z.object({
      termId: z.int(),
    }),
  )
  .output(z.void())
  .handler(async ({ input }) => {
    await deleteTermOp(input);
  });

export const get = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
    }),
  )
  .output(GlossarySchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { glossaryId } = input;

    return assertSingleOrNull(
      await drizzle
        .select()
        .from(glossaryTable)
        .where(eq(glossaryTable.id, glossaryId)),
    );
  });

export const getUserOwned = authed
  .input(
    z.object({
      userId: z.uuidv4(),
    }),
  )
  .output(z.array(GlossarySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { userId } = input;

    return await drizzle
      .select(getColumns(glossaryTable))
      .from(glossaryTable)
      .where(eq(glossaryTable.creatorId, userId));
  });

export const getProjectOwned = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .output(z.array(GlossarySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { projectId } = input;

    return await drizzle
      .select(getColumns(glossaryTable))
      .from(glossaryToProject)
      .innerJoin(
        glossaryTable,
        eq(glossaryToProject.glossaryId, glossaryTable.id),
      )
      .where(eq(glossaryToProject.projectId, projectId));
  });

export const countTerm = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
    }),
  )
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { glossaryId } = input;

    return assertSingleNonNullish(
      await drizzle
        .select({ count: count() })
        .from(termConcept)
        .where(eq(termConcept.glossaryId, glossaryId)),
    ).count;
  });

export const create = authed
  .input(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      projectIds: z.array(z.uuidv4()).optional(),
    }),
  )
  .output(GlossarySchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { name, description, projectIds } = input;

    return await drizzle.transaction(async (tx) => {
      const glossary = assertSingleNonNullish(
        await tx
          .insert(glossaryTable)
          .values({
            name,
            description,
            creatorId: user.id,
          })
          .returning(),
      );

      if (projectIds && projectIds.length > 0)
        await drizzle.insert(glossaryToProject).values(
          projectIds.map((projectId) => ({
            glossaryId: glossary.id,
            projectId,
          })),
        );

      return glossary;
    });
  });

export const insertTerm = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
      termsData: z.array(TermDataSchema),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const { pluginManager, user } = context;
    const { termsData, glossaryId } = input;

    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!storage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider available",
      });
    }

    await createTermTask.run({
      glossaryId,
      data: termsData,
      creatorId: user.id,
      vectorizerId: vectorizer.id,
      vectorStorageId: storage.id,
    });
  });

export const searchTerm = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      text: z.string(),
      termLanguageId: z.string(),
      translationLanguageId: z.string(),
    }),
  )
  // Streams results: ILIKE matches arrive first, semantic matches follow.
  .handler(async function* ({ context, input }) {
    // jsgen: generator required — no arrow-function equivalent for async generators
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { text, termLanguageId, translationLanguageId, projectId } = input;

    const glossaryIds = (
      await drizzle
        .select({ id: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, projectId))
    ).map((row) => row.id);

    const stream = streamSearchTermsOp({
      glossaryIds,
      text,
      sourceLanguageId: termLanguageId,
      translationLanguageId,
      minSimilarity: 0.4,
    });

    for await (const t of stream) {
      yield {
        term: t.term,
        translation: t.translation,
        definition: t.definition,
        termLanguageId,
        translationLanguageId,
      };
    }
  });

export const findTerm = authed
  .input(
    z.object({
      elementId: z.int(),
      translationLanguageId: z.string(),
    }),
  )
  // This endpoint streams term suggestions to avoid blocking response while waiting for worker
  .handler(async function* ({ context, input }) {
    // jsgen: generator required — no arrow-function equivalent for async generators
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, translationLanguageId } = input;

    const element = assertSingleNonNullish(
      await drizzle
        .select({
          id: translatableElement.id,
          value: translatableString.value,
          meta: translatableElement.meta,
          languageId: translatableString.languageId,
          documentId: translatableElement.documentId,
        })
        .from(translatableElement)
        .innerJoin(
          translatableString,
          eq(translatableElement.translatableStringId, translatableString.id),
        )
        .where(eq(translatableElement.id, elementId))
        .limit(1),
    );

    const { projectId } = assertSingleNonNullish(
      await drizzle
        .select({ projectId: documentTable.projectId })
        .from(documentTable)
        .where(eq(documentTable.id, element.documentId))
        .limit(1),
    );

    const glossaryIds = (
      await drizzle
        .select({ id: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, projectId))
    ).map((row) => row.id);

    const stream = streamSearchTermsOp({
      glossaryIds,
      text: element.value,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      minSimilarity: 0.4,
    });

    for await (const t of stream) {
      yield {
        term: t.term,
        translation: t.translation,
        definition: t.definition,
        termLanguageId: element.languageId,
        translationLanguageId,
      };
    }
  });

export const updateConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      subjectIds: z.array(z.int()).optional(),
      definition: z.string().optional(),
    }),
  )
  .output(z.void())
  .handler(async ({ input }) => {
    await updateConceptOp(input);
  });

export const addTermToConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      text: z.string(),
      languageId: z.string(),
      type: z.enum(TermTypeValues).optional().default("NOT_SPECIFIED"),
      status: z.enum(TermStatusValues).optional().default("PREFERRED"),
    }),
  )
  .output(z.object({ termId: z.int() }))
  .handler(async ({ context, input }) => {
    return await addTermToConceptOp({
      ...input,
      creatorId: context.user.id,
    });
  });

export const getConceptSubjects = authed
  .input(
    z.object({
      glossaryId: z.string(),
    }),
  )
  .output(z.array(z.object({ id: z.int(), subject: z.string() })))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { glossaryId } = input;

    const subjects = await drizzle
      .select({
        id: termConceptSubject.id,
        subject: termConceptSubject.subject,
      })
      .from(termConceptSubject)
      .where(eq(termConceptSubject.glossaryId, glossaryId))
      .orderBy(termConceptSubject.subject);

    return subjects;
  });

export const glossaryRouter = {
  deleteTerm,
  get,
  getUserOwned,
  getProjectOwned,
  countTerm,
  create,
  insertTerm,
  searchTerm,
  findTerm,
  updateConcept,
  addTermToConcept,
  getConceptSubjects,
};
