import { GlossarySchema } from "@cat/shared/schema/drizzle/glossary";
import * as z from "zod/v4";
import { TermDataSchema } from "@cat/shared/schema/misc";
import {
  and,
  count,
  eq,
  glossary as glossaryTable,
  glossaryToProject,
  inArray,
  term as termTable,
  document as documentTable,
  aliasedTable,
  translatableElement,
  translatableString,
  getColumns,
  termEntry,
  type DrizzleTransaction,
} from "@cat/db";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
  assertSingleOrNull,
} from "@cat/shared/utils";
import type { TermExtractor, TermRecognizer } from "@cat/plugin-core";
import { createTermTask, searchTermTask } from "@cat/app-workers";
import { authed } from "@/orpc/server";
import { ORPCError } from "@orpc/client";
import { firstOrGivenService } from "@cat/app-server-shared/utils";

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
      pluginManager,
    } = context;
    const { text, termLanguageId, translationLanguageId, projectId } = input;

    // TODO 配置
    const { service: termExtractor } = assertFirstNonNullish(
      pluginManager.getServices("TERM_EXTRACTOR"),
      `No term extractor plugin found in this scope`,
    );
    const { service: termRecognizer } = assertFirstNonNullish(
      pluginManager.getServices("TERM_RECOGNIZER"),
      `No term recognizer plugin found in this scope`,
    );

    return await drizzle.transaction(async (tx) => {
      return await findTermRelationsInProject(
        tx,
        termExtractor,
        termRecognizer,
        projectId,
        text,
        termLanguageId,
        translationLanguageId,
      );
    });
  });

export const findTerm = authed
  .input(
    z.object({
      elementId: z.int(),
      translationLanguageId: z.string(),
    }),
  )
  .output(
    z.array(
      z.object({
        term: z.string(),
        translation: z.string(),
        subject: z.string().nullable(),
        termLanguageId: z.string(),
        translationLanguageId: z.string(),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
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

    if (!element || !element.documentId)
      throw new ORPCError("BAD_REQUEST", {
        message: "Element does not exists",
      });

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

    const { result } = await searchTermTask.run({
      glossaryIds,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      text: element.value,
    });

    return (await result()).terms.map((term) => ({
      term: term.term,
      translation: term.translation,
      subject: term.subject,
      termLanguageId: element.languageId,
      translationLanguageId,
    }));
  });

const findTermRelationsInProject = async (
  drizzle: DrizzleTransaction,
  termExtractor: TermExtractor,
  termRecognizer: TermRecognizer,
  projectId: string,
  text: string,
  sourceLanguageId: string,
  translationLanguageId: string,
): Promise<
  {
    term: string;
    translation: string;
    termLanguageId: string;
    translationLanguageId: string;
  }[]
> => {
  const glossaryIds = (
    await drizzle
      .select({
        id: glossaryToProject.glossaryId,
      })
      .from(glossaryToProject)
      .where(eq(glossaryToProject.projectId, projectId))
  ).map((item) => item.id);

  if (glossaryIds.length === 0) {
    return [];
  }

  const candidates = await termExtractor.extract({
    text,
    languageId: sourceLanguageId,
  });
  const entryIds = (
    await termRecognizer.recognize({
      source: {
        text,
        candidates,
      },
      languageId: sourceLanguageId,
    })
  ).map((entry) => entry.termEntryId);

  const sourceTerm = aliasedTable(termTable, "sourceTerm");
  const translationTerm = aliasedTable(termTable, "translationTerm");
  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );
  const relations = await drizzle
    .select({
      term: sourceString.value,
      translation: translationString.value,
      termLanguageId: sourceString.languageId,
      translationLanguageId: translationString.languageId,
    })
    .from(termEntry)
    .innerJoin(sourceTerm, eq(termEntry.id, sourceTerm.termEntryId))
    .innerJoin(translationTerm, eq(termEntry.id, translationTerm.termEntryId))
    .innerJoin(sourceString, eq(sourceTerm.stringId, sourceString.id))
    .innerJoin(
      translationString,
      eq(translationTerm.stringId, translationString.id),
    )
    .where(
      and(
        inArray(termEntry.id, entryIds),
        inArray(termEntry.glossaryId, glossaryIds),
        eq(sourceString.languageId, sourceLanguageId),
        eq(translationString.languageId, translationLanguageId),
      ),
    );

  return relations;
};
