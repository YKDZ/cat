import {
  GlossarySchema,
  TermRelationSchema,
  TermSchema,
} from "@cat/shared/schema/drizzle/glossary";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { UserSchema } from "@cat/shared/schema/drizzle/user";
import {
  and,
  count,
  eq,
  getTableColumns,
  glossary as glossaryTable,
  glossaryToProject,
  inArray,
  termRelation as termRelationTable,
  term as termTable,
  document as documentTable,
  project as projectTable,
  aliasedTable,
  translatableElement,
  translatableString,
} from "@cat/db";
import { assertSingleNonNullish, zip } from "@cat/shared/utils";
import { authedProcedure, router } from "../server.ts";

export const glossaryRouter = router({
  deleteTerm: authedProcedure
    .input(
      z.object({
        ids: z.array(z.number().int()),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { ids } = input;

      await drizzle.delete(termTable).where(inArray(termTable.id, ids));
    }),
  queryTerms: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
        sourceLanguageId: z.string().nullable(),
        translationLanguageId: z.string().nullable(),
      }),
    )
    .output(z.array(TermRelationSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, sourceLanguageId, translationLanguageId } = input;

      const relationTerm = aliasedTable(termTable, "relationTerm");
      const relationTranslation = aliasedTable(
        termTable,
        "relationTranslation",
      );
      const relations = await drizzle
        .select({
          ...getTableColumns(termRelationTable),
          Term: getTableColumns(relationTerm),
          Translation: getTableColumns(relationTranslation),
        })
        .from(termRelationTable)
        .innerJoin(relationTerm, eq(termRelationTable.termId, relationTerm.id))
        .innerJoin(
          relationTranslation,
          eq(termRelationTable.translationId, relationTranslation.id),
        )
        .where(
          and(
            sourceLanguageId
              ? eq(relationTranslation.languageId, sourceLanguageId)
              : undefined,
            translationLanguageId
              ? eq(relationTerm.languageId, translationLanguageId)
              : undefined,
            eq(relationTranslation.glossaryId, id),
            eq(relationTerm.glossaryId, id),
          ),
        );

      return relations;
    }),
  get: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
      }),
    )
    .output(
      GlossarySchema.extend({
        Creator: UserSchema,
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return (
        (await drizzle.query.glossary.findFirst({
          where: (glossary, { eq }) => eq(glossary.id, id),
          with: {
            Creator: true,
          },
        })) ?? null
      );
    }),
  listUserOwned: authedProcedure
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
  listProjectOwned: authedProcedure
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
  countTerm: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
      }),
    )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return assertSingleNonNullish(
        await drizzle
          .select({ count: count() })
          .from(termTable)
          .where(eq(termTable.glossaryId, id)),
      ).count;
    }),
  create: authedProcedure
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
  insertTerm: authedProcedure
    .input(
      z.object({
        glossaryId: z.uuidv7(),
        termsData: z.array(TermDataSchema),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
        user,
      } = ctx;
      const { glossaryId, termsData } = input;

      // TODO 选择安装的服务或者继承
      const { service: termService } = (await pluginRegistry.getPluginService(
        drizzle,
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      ))!;

      if (!termService) throw new Error("Term service does not exists");

      if (termsData.length === 0) return;

      await drizzle.transaction(async (tx) => {
        const terms = await tx
          .insert(termTable)
          .values(
            termsData.map((term) => ({
              value: term.term,
              languageId: term.termLanguageId,
              creatorId: user.id,
              glossaryId,
            })),
          )
          .returning({ id: termTable.id });

        const translations = await tx
          .insert(termTable)
          .values(
            termsData.map((term) => ({
              value: term.translation,
              languageId: term.translationLanguageId,
              creatorId: user.id,
              glossaryId,
            })),
          )
          .returning({ id: termTable.id });

        const relations = await drizzle
          .insert(termRelationTable)
          .values(
            zip(terms, translations).flatMap(([term, translation]) => [
              { termId: term.id, translationId: translation.id }, // 正向
              { termId: translation.id, translationId: term.id }, // 反向
            ]),
          )
          .returning({ id: termRelationTable.id });

        const relationTerm = aliasedTable(termTable, "relationTerm");
        const relationTranslation = aliasedTable(
          termTable,
          "relationTranslation",
        );
        const termRelations = await drizzle
          .select({
            ...getTableColumns(termRelationTable),
            Term: getTableColumns(relationTerm),
            Translation: getTableColumns(relationTranslation),
          })
          .from(termRelationTable)
          .innerJoin(
            relationTerm,
            eq(termRelationTable.termId, relationTerm.id),
          )
          .innerJoin(
            relationTranslation,
            eq(termRelationTable.translationId, relationTranslation.id),
          )
          .where(
            inArray(
              termRelationTable.id,
              relations.map((t) => t.id),
            ),
          );

        await termService.termStore.insertTerms(...termRelations);
      });
    }),
  searchTerm: authedProcedure
    .input(
      z.object({
        text: z.string(),
        termLanguageId: z.string(),
        translationLanguageId: z.string(),
      }),
    )
    .output(
      z.array(
        TermRelationSchema.extend({
          Term: TermSchema,
          Translation: TermSchema,
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { text, termLanguageId, translationLanguageId } = input;

      // TODO 选择安装的服务或者继承
      const { service: termService } = (await pluginRegistry.getPluginService(
        drizzle,
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      ))!;

      if (!termService) throw new Error("Term service does not exists");

      const translationIds = await termService.termStore.searchTerm(
        text,
        termLanguageId,
      );

      const relationTerm = aliasedTable(termTable, "relationTerm");
      const relationTranslation = aliasedTable(
        termTable,
        "relationTranslation",
      );
      const relations = await drizzle
        .select({
          ...getTableColumns(termRelationTable),
          Term: getTableColumns(relationTerm),
          Translation: getTableColumns(relationTranslation),
        })
        .from(termRelationTable)
        .innerJoin(relationTerm, eq(termRelationTable.termId, relationTerm.id))
        .innerJoin(
          relationTranslation,
          eq(termRelationTable.translationId, relationTranslation.id),
        )
        .where(
          and(
            inArray(relationTranslation.id, translationIds),
            eq(relationTranslation.languageId, translationLanguageId),
          ),
        );

      return relations;
    }),
  findTerm: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        translationLanguageId: z.string(),
      }),
    )
    .output(
      z.array(
        TermRelationSchema.extend({
          Term: TermSchema,
          Translation: TermSchema,
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
      const { service: termService } = (await pluginRegistry.getPluginService(
        drizzle,
        "es-term-service",
        "TERM_SERVICE",
        "ES",
      ))!;

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
            eq(translatableElement.translableStringId, translatableString.id),
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

      const glossaryIds = (
        await drizzle
          .select({
            id: glossaryToProject.glossaryId,
          })
          .from(projectTable)
          .innerJoin(
            glossaryToProject,
            eq(projectTable.id, glossaryToProject.projectId),
          )
          .where(eq(projectTable.id, projectId))
      ).map((item) => item.id);

      if (!element)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请求术语的元素不存在",
        });

      const translationIds = await termService.termStore.searchTerm(
        element.value,
        element.languageId,
      );

      const relationTerm = aliasedTable(termTable, "relationTerm");
      const relationTranslation = aliasedTable(
        termTable,
        "relationTranslation",
      );
      const relations = await drizzle
        .select({
          ...getTableColumns(termRelationTable),
          Term: getTableColumns(relationTerm),
          Translation: getTableColumns(relationTranslation),
        })
        .from(termRelationTable)
        .innerJoin(relationTerm, eq(termRelationTable.termId, relationTerm.id))
        .innerJoin(
          relationTranslation,
          eq(termRelationTable.translationId, relationTranslation.id),
        )
        .where(
          and(
            inArray(relationTranslation.id, translationIds),
            inArray(relationTranslation.glossaryId, glossaryIds),
            inArray(relationTerm.glossaryId, glossaryIds),
            eq(relationTerm.languageId, element.languageId),
            eq(relationTranslation.languageId, translationLanguageId),
          ),
        );

      return relations;
    }),
});
