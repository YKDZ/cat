import { GlossarySchema } from "@cat/shared/schema/drizzle/glossary";
import { TRPCError } from "@trpc/server";
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
  task,
  OverallDrizzleClient,
  getColumns,
  termEntry,
} from "@cat/db";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
  assertSingleOrNull,
} from "@cat/shared/utils";
import {
  permissionProcedure,
  permissionsProcedure,
  router,
} from "../server.ts";
import type { TermExtractor, TermRecognizer } from "@cat/plugin-core";

export const glossaryRouter = router({
  deleteTerm: permissionProcedure(
    "TERM",
    "delete",
    z.object({
      termId: z.int(),
    }),
  )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { termId } = input;

      await drizzle.delete(termTable).where(eq(termTable.id, termId));
    }),
  get: permissionProcedure(
    "GLOSSARY",
    "get",
    z.object({
      glossaryId: z.uuidv7(),
    }),
  )
    .output(GlossarySchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { glossaryId } = input;

      return assertSingleOrNull(
        await drizzle
          .select()
          .from(glossaryTable)
          .where(eq(glossaryTable.id, glossaryId)),
      );
    }),
  getUserOwned: permissionProcedure("GLOSSARY", "get.user-owned")
    .input(
      z.object({
        userId: z.uuidv7(),
      }),
    )
    .output(z.array(GlossarySchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { userId } = input;

      return await drizzle
        .select(getColumns(glossaryTable))
        .from(glossaryTable)
        .where(eq(glossaryTable.creatorId, userId));
    }),
  getProjectOwned: permissionProcedure("GLOSSARY", "get.project-owned")
    .input(
      z.object({
        projectId: z.uuidv7(),
      }),
    )
    .output(z.array(GlossarySchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { projectId } = input;

      return await drizzle
        .select(getColumns(glossaryTable))
        .from(glossaryTable)
        .where(eq(glossaryToProject.projectId, projectId));
    }),
  countTerm: permissionProcedure(
    "GLOSSARY",
    "count.term",
    z.object({
      glossaryId: z.uuidv7(),
    }),
  )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { glossaryId } = input;

      return assertSingleNonNullish(
        await drizzle
          .select({ count: count() })
          .from(termEntry)
          .where(eq(termEntry.glossaryId, glossaryId)),
      ).count;
    }),
  create: permissionProcedure("GLOSSARY", "create")
    .input(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        projectIds: z.array(z.uuidv7()).optional(),
      }),
    )
    .output(GlossarySchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
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
    }),
  insertTerm: permissionProcedure(
    "GLOSSARY",
    "term.insert",
    z.object({
      glossaryId: z.uuidv7(),
    }),
  )
    .input(
      z.object({
        termsData: z.array(TermDataSchema),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        workerRegistry,
        user,
      } = ctx;
      const { termsData, glossaryId } = input;

      const dbTask = assertSingleNonNullish(
        await drizzle
          .insert(task)
          .values({
            type: "INSERT_TERMS",
          })
          .returning({ id: task.id }),
      );

      await workerRegistry.addJob(
        "insert-term",
        {
          glossaryId,
          termsData,
          creatorId: user.id,
        },
        {
          jobId: dbTask.id,
        },
      );
    }),
  searchTerm: permissionsProcedure([
    {
      resourceType: "PROJECT",
      requiredPermission: "glossary.term.search",
      inputSchema: z.object({
        projectId: z.uuidv7(),
      }),
    },
    {
      resourceType: "TERM",
      requiredPermission: "search",
    },
  ])
    .input(
      z.object({
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
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { text, termLanguageId, translationLanguageId, projectId } = input;

      const { service: termExtractor } = assertFirstNonNullish(
        pluginRegistry.getPluginServices("TERM_EXTRACTOR"),
        `No term extractor plugin found in this scope`,
      );
      const { service: termRecognizer } = assertFirstNonNullish(
        pluginRegistry.getPluginServices("TERM_RECOGNIZER"),
        `No term recognizer plugin found in this scope`,
      );

      return await findTermRelationsInProject(
        drizzle,
        termExtractor,
        termRecognizer,
        projectId,
        text,
        termLanguageId,
        translationLanguageId,
      );
    }),
  findTerm: permissionProcedure(
    "ELEMENT",
    "find-term",
    z.object({
      elementId: z.int(),
    }),
  )
    .input(
      z.object({
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
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { elementId, translationLanguageId } = input;

      const { service: termExtractor } = assertFirstNonNullish(
        pluginRegistry.getPluginServices("TERM_EXTRACTOR"),
        `No term extractor plugin found in this scope`,
      );
      const { service: termRecognizer } = assertFirstNonNullish(
        pluginRegistry.getPluginServices("TERM_RECOGNIZER"),
        `No term recognizer plugin found in this scope`,
      );

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
        throw new TRPCError({
          code: "BAD_REQUEST",
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

      return await findTermRelationsInProject(
        drizzle,
        termExtractor,
        termRecognizer,
        projectId,
        element.value,
        element.languageId,
        translationLanguageId,
      );
    }),
});

const findTermRelationsInProject = async (
  drizzle: OverallDrizzleClient,
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

  const candidates = await termExtractor.extract(text, sourceLanguageId);
  const entryIds = (
    await termRecognizer.recognize(
      {
        text,
        candidates,
      },
      sourceLanguageId,
    )
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
