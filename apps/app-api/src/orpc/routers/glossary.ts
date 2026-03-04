import {
  AsyncMessageQueue,
  firstOrGivenService,
  lookupTerms,
} from "@cat/app-server-shared/utils";
import { createTermTask, recognizeTermTask } from "@cat/app-workers";
import {
  count,
  eq,
  glossary as glossaryTable,
  glossaryToProject,
  term as termTable,
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
import {
  assertSingleNonNullish,
  assertSingleOrNull,
  logger,
} from "@cat/shared/utils";
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
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { termId } = input;

    await drizzle.delete(termTable).where(eq(termTable.id, termId));
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
  .output(
    z.array(
      z.object({
        term: z.string(),
        translation: z.string(),
        termLanguageId: z.string(),
        translationLanguageId: z.string(),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { text, termLanguageId, translationLanguageId, projectId } = input;

    const glossaryIds = (
      await drizzle
        .select({
          id: glossaryToProject.glossaryId,
        })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, projectId))
    ).map((row) => row.id);

    const terms = await lookupTerms(drizzle, {
      glossaryIds,
      sourceLanguageId: termLanguageId,
      translationLanguageId,
      text,
    });

    return terms.map((t) => ({
      term: t.term,
      translation: t.translation,
      termLanguageId,
      translationLanguageId,
    }));
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
        .select({
          projectId: documentTable.projectId,
        })
        .from(documentTable)
        .where(eq(documentTable.id, element.documentId))
        .limit(1),
    );

    const glossaryIds = (
      await drizzle
        .select({
          id: glossaryToProject.glossaryId,
        })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, projectId))
    ).map((row) => row.id);

    const termsQueue = new AsyncMessageQueue<{
      term: string;
      translation: string;
      definition: string | null;
      termLanguageId: string;
      translationLanguageId: string;
    }>();

    const seenTerms = new Set<string>();

    const pushTerms = (
      terms: {
        term: string;
        translation: string;
        definition: string | null;
        conceptId?: number;
        glossaryId?: string;
      }[],
    ) => {
      const newTerms = terms.filter((t) => {
        const key = `${t.term}:${t.translation}`;
        if (seenTerms.has(key)) return false;
        seenTerms.add(key);
        return true;
      });

      termsQueue.push(
        ...newTerms.map((term) => ({
          term: term.term,
          translation: term.translation,
          definition: term.definition,
          conceptId: term.conceptId,
          glossaryId: term.glossaryId,
          termLanguageId: element.languageId,
          translationLanguageId,
        })),
      );
    };

    const taskInput = {
      glossaryIds,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      text: element.value,
    };

    const runTasks = async () => {
      await Promise.allSettled([
        lookupTerms(drizzle, taskInput).then((terms) => {
          pushTerms(terms);
        }),
        recognizeTermTask
          .run(taskInput)
          .then(async ({ result }) => await result())
          .then((output) => {
            pushTerms(output.terms);
          }),
      ]);
    };

    void runTasks()
      .catch((err: unknown) => {
        logger.error("WORKER", { msg: "Find term failed" }, err);
      })
      .finally(() => {
        termsQueue.close();
      });

    try {
      for await (const term of termsQueue.consume()) {
        yield term;
      }
    } finally {
      termsQueue.close();
    }
  });

export const updateConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      subjectId: z.int().nullable().optional(),
      definition: z.string().optional(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { conceptId, subjectId, definition } = input;

    await drizzle.transaction(async (tx) => {
      // 如果提供了 subjectId，则更新主题关联
      if (subjectId !== undefined) {
        await tx
          .update(termConcept)
          .set({ subjectId })
          .where(eq(termConcept.id, conceptId));
      }

      // 更新概念定义
      if (definition !== undefined) {
        await tx
          .update(termConcept)
          .set({ definition: definition || "" })
          .where(eq(termConcept.id, conceptId));
      }
    });
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
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { conceptId, text, languageId, type, status } = input;

    // 创建可翻译字符串
    const [translatableStringResult] = await drizzle
      .insert(translatableString)
      .values({
        value: text,
        languageId,
        chunkSetId: 1, // 使用默认的chunkSetId，实际应用中可能需要从上下文获取
      })
      .returning({ id: translatableString.id });

    // 创建术语
    const [termResult] = await drizzle
      .insert(termTable)
      .values({
        termConceptId: conceptId,
        stringId: translatableStringResult.id,
        type: type,
        status: status,
        creatorId: user.id,
      })
      .returning({ id: termTable.id });

    return { termId: termResult.id };
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
