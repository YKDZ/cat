import { GlossarySchema } from "@cat/shared/schema/drizzle/glossary";
import * as z from "zod/v4";
import { TermDataSchema } from "@cat/shared/schema/misc";
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
  termEntry,
} from "@cat/db";
import {
  assertSingleNonNullish,
  assertSingleOrNull,
  logger,
} from "@cat/shared/utils";
import { createTermTask, recognizeTermTask } from "@cat/app-workers";
import { authed } from "@/orpc/server";
import { ORPCError } from "@orpc/client";
import {
  AsyncMessageQueue,
  firstOrGivenService,
  lookupTerms,
} from "@cat/app-server-shared/utils";

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
        .from(termEntry)
        .where(eq(termEntry.glossaryId, glossaryId)),
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
      subject: string | null;
      termLanguageId: string;
      translationLanguageId: string;
    }>();

    const seenTerms = new Set<string>();

    const pushTerms = (
      terms: {
        term: string;
        translation: string;
        subject: string | null;
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
          subject: term.subject,
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
        logger.error("PROCESSOR", { msg: "Find term failed" }, err);
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
