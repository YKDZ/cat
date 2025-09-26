import { ProjectSchema } from "@cat/shared/schema/prisma/project";
import * as z from "zod/v4";
import { DocumentSchema } from "@cat/shared/schema/prisma/document";
import { UserSchema } from "@cat/shared/schema/prisma/user";
import { LanguageSchema } from "@cat/shared/schema/prisma/misc";
import { FileSchema } from "@cat/shared/schema/prisma/file";
import {
  eq,
  glossaryToProject,
  memoryToProject,
  project as projectTable,
  projectTargetLanguage,
  memory as memoryTable,
  and,
  inArray,
  document as documentTable,
  translatableElement as translatableElementTable,
  translation as translationTable,
  translationApprovement as translationApprovementTable,
  count,
} from "@cat/db";
import { getSingle } from "@cat/shared/utils";
import { authedProcedure, router } from "@/trpc/server.ts";

export const projectRouter = router({
  delete: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      await drizzle.delete(projectTable).where(eq(projectTable.id, id));
    }),
  update: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
        name: z.string().min(1).optional(),
        sourceLanguageId: z.string().optional(),
        targetLanguageIds: z.array(z.string()).optional(),
        description: z.string().min(0).optional(),
      }),
    )
    .output(ProjectSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, name, sourceLanguageId, targetLanguageIds, description } =
        input;

      return await drizzle.transaction(async (tx) => {
        if (targetLanguageIds) {
          await tx
            .delete(projectTargetLanguage)
            .where(eq(projectTargetLanguage.projectId, id));

          await tx.insert(projectTargetLanguage).values(
            targetLanguageIds.map((languageId) => ({
              projectId: id,
              languageId,
            })),
          );
        }
        if (sourceLanguageId)
          await tx
            .update(projectTable)
            .set({
              sourceLanguageId,
            })
            .where(eq(projectTable.id, id));

        return getSingle(
          await tx
            .update(projectTable)
            .set({
              name,
              description,
            })
            .where(eq(projectTable.id, id))
            .returning(),
        );
      });
    }),
  create: authedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string().nullable(),
        sourceLanguageId: z.string(),
        targetLanguageIds: z.array(z.string()),
        memoryIds: z.array(z.uuidv7()),
        glossaryIds: z.array(z.uuidv7()),
        createMemory: z.boolean(),
        createGlossary: z.boolean(),
      }),
    )
    .output(ProjectSchema)
    .mutation(async ({ input, ctx }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const {
        name,
        description,
        sourceLanguageId,
        targetLanguageIds,
        memoryIds,
        glossaryIds,
        createMemory,
        createGlossary,
      } = input;

      return await drizzle.transaction(async (tx) => {
        // TODO 源语言不应该是项目的属性
        const project = getSingle(
          await tx
            .insert(projectTable)
            .values({
              name,
              description,
              creatorId: user.id,
              sourceLanguageId,
            })
            .returning(),
        );

        await tx.insert(projectTargetLanguage).values(
          targetLanguageIds.map((languageId) => ({
            projectId: project.id,
            languageId,
          })),
        );

        if (createMemory) {
          const memory = getSingle(
            await tx
              .insert(memoryTable)
              .values({
                name,
                creatorId: user.id,
              })
              .returning({ id: memoryTable.id }),
          );
          memoryIds.push(memory.id);
        }

        if (createGlossary) {
          const memory = getSingle(
            await tx
              .insert(memoryTable)
              .values({
                name,
                creatorId: user.id,
              })
              .returning({ id: memoryTable.id }),
          );
          memoryIds.push(memory.id);
        }

        if (glossaryIds.length > 0)
          await tx.insert(glossaryToProject).values(
            glossaryIds.map((glossaryId) => ({
              projectId: project.id,
              glossaryId,
            })),
          );

        if (memoryIds.length > 0)
          await tx.insert(memoryToProject).values(
            memoryIds.map((memoryId) => ({
              projectId: project.id,
              memoryId,
            })),
          );

        return project;
      });
    }),
  linkGlossary: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
        glossaryIds: z.array(z.uuidv7()),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, glossaryIds } = input;

      if (glossaryIds.length === 0) return;

      await drizzle.insert(glossaryToProject).values(
        glossaryIds.map((glossaryId) => ({
          projectId: id,
          glossaryId,
        })),
      );
    }),
  linkMemory: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
        memoryIds: z.array(z.uuidv7()),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, memoryIds } = input;

      if (memoryIds.length === 0) return;

      await drizzle.insert(memoryToProject).values(
        memoryIds.map((memoryId) => ({
          projectId: id,
          memoryId,
        })),
      );
    }),
  unlinkGlossary: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
        glossaryIds: z.array(z.uuidv7()),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, glossaryIds } = input;

      await drizzle
        .delete(glossaryToProject)
        .where(
          and(
            eq(glossaryToProject.projectId, id),
            inArray(glossaryToProject.glossaryId, glossaryIds),
          ),
        );
    }),
  unlinkMemory: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
        memoryIds: z.array(z.uuidv7()),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, memoryIds } = input;

      await drizzle
        .delete(memoryToProject)
        .where(
          and(
            eq(memoryToProject.projectId, id),
            inArray(memoryToProject.memoryId, memoryIds),
          ),
        );
    }),
  listUserOwned: authedProcedure
    .output(
      z.array(
        ProjectSchema.extend({
          Creator: UserSchema,
          SourceLanguage: LanguageSchema,
          Documents: z.array(
            DocumentSchema.extend({
              File: FileSchema.nullable(),
            }),
          ),
        }),
      ),
    )
    .query(async ({ ctx }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;

      return await drizzle.query.project.findMany({
        where: (project, { eq }) => eq(project.creatorId, user.id),
        with: {
          Creator: true,
          SourceLanguage: true,
          Documents: {
            with: {
              File: true,
            },
          },
        },
      });
    }),
  get: authedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(
      ProjectSchema.extend({
        Creator: UserSchema,
        SourceLanguage: LanguageSchema,
        Documents: z.array(
          DocumentSchema.extend({
            File: FileSchema.nullable(),
          }),
        ),
      }).nullable(),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return (
        (await drizzle.query.project.findFirst({
          where: (project, { eq }) => eq(project.id, id),
          with: {
            Creator: true,
            SourceLanguage: true,
            Documents: {
              with: {
                File: true,
              },
            },
          },
        })) ?? null
      );
    }),
  addNewLanguage: authedProcedure
    .input(
      z.object({
        projectId: z.string(),
        languageId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { projectId, languageId } = input;

      await drizzle.insert(projectTargetLanguage).values({
        projectId,
        languageId,
      });
    }),
  countElement: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
        isTranslated: z.boolean().optional(),
        isApproved: z.boolean().optional(),
      }),
    )
    .output(z.int().min(0))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, isApproved, isTranslated } = input;

      const baseQuery = drizzle
        .select({ count: count() })
        .from(translatableElementTable)
        .innerJoin(
          documentTable,
          eq(translatableElementTable.documentId, documentTable.id),
        )
        .innerJoin(projectTable, eq(documentTable.projectId, projectTable.id))
        .where(
          and(
            eq(projectTable.id, id),
            isApproved
              ? eq(translationApprovementTable.isActive, isApproved)
              : undefined,
          ),
        );

      if (isTranslated !== undefined || isApproved !== undefined) {
        baseQuery.innerJoin(
          translationTable,
          eq(
            translationTable.translatableElementId,
            translatableElementTable.id,
          ),
        );

        if (isApproved !== undefined) {
          baseQuery.innerJoin(
            translationApprovementTable,
            eq(translationApprovementTable.translationId, translationTable.id),
          );
        }
      }

      return getSingle(await baseQuery).count;
    }),
  countTranslation: authedProcedure
    .input(
      z.object({
        id: z.uuidv7(),
        languageId: z.string(),
        isApproved: z.boolean().optional(),
      }),
    )
    .output(z.int().min(0))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, languageId, isApproved } = input;

      const baseQuery = drizzle
        .select({ count: count() })
        .from(translationTable)
        .innerJoin(
          translatableElementTable,
          eq(
            translationTable.translatableElementId,
            translatableElementTable.id,
          ),
        )
        .where(
          and(
            eq(translatableElementTable.documentId, id),
            eq(translationTable.languageId, languageId),
            isApproved
              ? eq(translationApprovementTable.isActive, isApproved)
              : undefined,
          ),
        );

      if (isApproved !== undefined) {
        baseQuery.innerJoin(
          translationApprovementTable,
          eq(translationApprovementTable.translationId, translationTable.id),
        );
      }

      return getSingle(await baseQuery).count;
    }),
  getDocuments: authedProcedure
    .input(z.object({ projectId: z.string() }))
    .output(z.array(DocumentSchema.extend({ File: FileSchema.nullable() })))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { projectId } = input;

      return await drizzle.query.document.findMany({
        where: (document, { eq }) => eq(document.projectId, projectId),
        with: {
          File: true,
        },
      });
    }),
});
