import { GlossarySchema } from "@cat/shared/schema/drizzle/glossary";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { UserSchema } from "@cat/shared/schema/drizzle/user";
import {
  and,
  count,
  eq,
  glossary as glossaryTable,
  glossaryToProject,
  inArray,
  termRelation as termRelationTable,
  term as termTable,
  document as documentTable,
  aliasedTable,
  translatableElement,
  translatableString,
  task,
  OverallDrizzleClient,
} from "@cat/db";
import { assertSingleNonNullish, assertSingleOrNull } from "@cat/shared/utils";
import {
  permissionProcedure,
  permissionsProcedure,
  router,
} from "../server.ts";
import { TermService } from "@cat/plugin-core";

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
    .output(z.array(GlossarySchema.extend({ Creator: UserSchema })))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { userId } = input;

      return await drizzle.query.glossary.findMany({
        where: (glossary, { eq }) => eq(glossary.creatorId, userId),
        with: {
          Creator: true,
        },
      });
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

      return (
        await drizzle.query.glossaryToProject.findMany({
          where: (glossaryToProject, { eq }) =>
            eq(glossaryToProject.projectId, projectId),
          with: {
            Glossary: true,
          },
        })
      ).map((item) => item.Glossary);
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
          .from(termTable)
          .where(eq(termTable.glossaryId, glossaryId)),
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
        pluginRegistry,
        workerRegistry,
        user,
      } = ctx;
      const { termsData, glossaryId } = input;

      // TODO 选择安装的服务或者继承
      const termService = pluginRegistry.getPluginService(
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      )!;

      if (!termService) throw new Error("Term service does not exists");

      if (termsData.length === 0) return;

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

      // TODO 选择安装的服务或者继承
      const termService = pluginRegistry.getPluginService(
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      )!;

      return await findTermRelationsInProject(
        drizzle,
        termService,
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

      // TODO 选择安装的服务或者继承
      const termService = pluginRegistry.getPluginService(
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      )!;

      if (!termService) throw new Error("Term service does not exists");

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
        termService,
        projectId,
        element.value,
        element.languageId,
        translationLanguageId,
      );
    }),
});

const findTermRelationsInProject = async (
  drizzle: OverallDrizzleClient,
  termService: TermService,
  projectId: string,
  value: string,
  sourceLanguageId: string,
  translationLanguageId: string,
) => {
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

  const translationIds = await termService.termStore.searchTerm(
    value,
    sourceLanguageId,
  );

  if (translationIds.length === 0) {
    return [];
  }

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
    .from(termRelationTable)
    .innerJoin(sourceTerm, eq(termRelationTable.termId, sourceTerm.id))
    .innerJoin(
      translationTerm,
      eq(termRelationTable.translationId, translationTerm.id),
    )
    .innerJoin(sourceString, eq(sourceTerm.stringId, sourceString.id))
    .innerJoin(
      translationString,
      eq(translationTerm.stringId, translationString.id),
    )
    .where(
      and(
        inArray(translationTerm.id, translationIds),
        eq(translationString.languageId, translationLanguageId),
        inArray(sourceTerm.glossaryId, glossaryIds),
        inArray(translationTerm.glossaryId, glossaryIds),
      ),
    );

  return relations;
};
