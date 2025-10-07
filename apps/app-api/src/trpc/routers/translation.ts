import * as z from "zod/v4";
import { TRPCError } from "@trpc/server";
import {
  TranslationApprovementSchema,
  TranslationSchema,
  TranslationVoteSchema,
} from "@cat/shared/schema/drizzle/translation";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { autoTranslateQueue } from "@cat/app-workers/workers";
import { createTranslationQueue } from "@cat/app-workers/workers";
import { updateTranslationQueue } from "@cat/app-workers/workers";
import { UserSchema } from "@cat/shared/schema/drizzle/user";
import {
  eq,
  translation as translationTable,
  task as taskTable,
  project as projectTable,
  document as documentTable,
  and,
  projectTargetLanguage,
  translationApprovement as translationApprovementTable,
  count,
  translationVote as translationVoteTable,
  translatableElement as translatableElementTable,
  sum,
  isNull,
  desc,
  sql,
} from "@cat/db";
import { authedProcedure, router } from "../server.ts";

export const translationRouter = router({
  delete: authedProcedure
    .input(
      z.object({
        translationId: z.int(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { translationId } = input;

      await drizzle
        .delete(translationTable)
        .where(eq(translationTable.id, translationId));
    }),
  create: authedProcedure
    .input(
      z.object({
        projectId: z.uuidv7(),
        elementId: z.number().int(),
        languageId: z.string(),
        value: z.string(),
        createMemory: z.boolean().default(true),
      }),
    )
    .output(
      TranslationSchema.extend({
        status: z.enum(["PROCESSING", "COMPLETED"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { projectId, elementId, languageId, value, createMemory } = input;

      return await drizzle.transaction(async (tx) => {
        const memoryIds = (
          await drizzle.query.memoryToProject.findMany({
            where: (memToProj, { eq }) => eq(memToProj.projectId, projectId),
            columns: { memoryId: true },
          })
        ).map((memToProj) => memToProj.memoryId);

        if (!memoryIds)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found",
          });

        const task = assertSingleNonNullish(
          await tx
            .insert(taskTable)
            .values({
              type: "create_translation",
            })
            .returning({ id: taskTable.id }),
        );

        await createTranslationQueue.add(
          task.id,
          {
            createMemory,
            elementId: elementId,
            creatorId: user.id,
            translationLanguageId: languageId,
            translationValue: value,
            memoryIds,
          },
          {
            jobId: task.id,
          },
        );

        return {
          id: 0,
          embeddingId: 0,
          meta: null,
          value,
          languageId,
          translatableElementId: elementId,
          translatorId: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: "PROCESSING",
        };
      });
    }),
  update: authedProcedure
    .input(
      z.object({
        id: z.number().int(),
        value: z.string(),
      }),
    )
    .output(
      TranslationSchema.extend({ status: z.enum(["PROCESSING", "COMPLETED"]) }),
    )
    .mutation(async ({ input, ctx }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id, value } = input;

      const translation = await drizzle.query.translation.findFirst({
        where: (translation, { eq }) => eq(translation.id, id),
      });

      if (!translation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Translation with given id not found",
        });

      const task = assertSingleNonNullish(
        await drizzle
          .insert(taskTable)
          .values({
            type: "update_translation",
          })
          .returning({ id: taskTable.id }),
      );

      await updateTranslationQueue.add(
        task.id,
        {
          translationId: id,
          translationValue: value,
        },
        {
          jobId: task.id,
        },
      );

      return {
        id: translation.id,
        embeddingId: translation.embeddingId,
        meta: null,
        value,
        languageId: translation.languageId,
        translatableElementId: translation.translatableElementId,
        translatorId: translation.translatorId,
        createdAt: translation.createdAt,
        updatedAt: new Date(),
        status: "PROCESSING",
      };
    }),
  getAll: authedProcedure
    .input(
      z.object({
        elementId: z.number().int(),
        languageId: z.string(),
      }),
    )
    .output(
      z.array(
        TranslationSchema.extend({
          Translator: UserSchema,
          TranslationApprovements: z.array(TranslationApprovementSchema),
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { elementId, languageId } = input;

      const translations = await drizzle.query.translation.findMany({
        where: (translations, { and, eq }) =>
          and(
            eq(translations.translatableElementId, elementId),
            eq(translations.languageId, languageId),
          ),
        with: {
          Translator: true,
          TranslationApprovements: true,
        },
      });

      return translations;
    }),
  vote: authedProcedure
    .input(
      z.object({
        translationId: z.number().int(),
        value: z.number().int(),
      }),
    )
    .output(TranslationVoteSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { translationId, value } = input;

      return assertSingleNonNullish(
        await drizzle
          .insert(translationVoteTable)
          .values({
            value,
            translationId,
            voterId: user.id,
          })
          .onConflictDoUpdate({
            target: [
              translationVoteTable.translationId,
              translationVoteTable.voterId,
            ],
            set: {
              value,
              translationId,
              voterId: user.id,
            },
          })
          .returning(),
      );
    }),
  countVote: authedProcedure
    .input(
      z.object({
        id: z.number().int(),
      }),
    )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      const { total } = assertSingleNonNullish(
        await drizzle
          .select({
            total: sum(translationVoteTable.value),
          })
          .from(translationVoteTable)
          .where(eq(translationVoteTable.translationId, id)),
      );

      if (!total) return 0;

      return Number(total);
    }),
  querySelfVote: authedProcedure
    .input(
      z.object({
        id: z.number().int(),
      }),
    )
    .output(TranslationVoteSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { id } = input;

      return (
        (await drizzle.query.translationVote.findFirst({
          where: (vote, { and, eq }) =>
            and(eq(vote.translationId, id), eq(vote.voterId, user.id)),
        })) ?? null
      );
    }),
  autoApprove: authedProcedure
    .input(
      z.object({
        documentId: z.uuidv7(),
        languageId: z.string(),
      }),
    )
    .output(z.number())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { documentId, languageId } = input;

      return await drizzle.transaction(async (tx) => {
        const translationIds = (
          await tx
            .select({
              translationId: translationTable.id,
            })
            .from(translatableElementTable)
            .innerJoin(
              translationTable,
              eq(
                translationTable.translatableElementId,
                translatableElementTable.id,
              ),
            )
            .leftJoin(
              translationApprovementTable,
              eq(
                translationApprovementTable.translationId,
                translationTable.id,
              ),
            )
            .where(
              and(
                eq(translatableElementTable.documentId, documentId),
                eq(translationTable.languageId, languageId),
                isNull(translationApprovementTable.id),
              ),
            )
            .orderBy(desc(sql`COUNT(${translationVoteTable.value})`))
            .limit(1)
        ).map((row) => row.translationId);

        if (translationIds.length === 0) return 0;

        const result = assertSingleNonNullish(
          await tx
            .insert(translationApprovementTable)
            .values(
              translationIds.map((id) => ({
                translationId: id,
                isActive: true,
                creatorId: user.id,
              })),
            )
            .returning({ count: count() }),
        );

        return result.count;
      });
    }),
  approve: authedProcedure
    .input(
      z.object({
        translationId: z.int(),
      }),
    )
    .output(TranslationApprovementSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { translationId } = input;

      return await drizzle.transaction(async (tx) => {
        const { exists } = assertSingleNonNullish(
          await tx
            .select({ exists: count() })
            .from(translationApprovementTable)
            .where(
              and(
                eq(translationApprovementTable.translationId, translationId),
                eq(translationApprovementTable.isActive, true),
              ),
            ),
        );

        if (exists > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Some translations already have active approvement",
          });
        }

        return assertSingleNonNullish(
          await tx
            .insert(translationApprovementTable)
            .values({
              translationId: translationId,
              isActive: true,
              creatorId: user.id,
            })
            .returning(),
        );
      });
    }),
  unapprove: authedProcedure
    .input(
      z.object({
        translationId: z.int(),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { translationId } = input;

      await drizzle
        .update(translationApprovementTable)
        .set({ isActive: false })
        .where(eq(translationApprovementTable.id, translationId));
    }),
  autoTranslate: authedProcedure
    .input(
      z.object({
        documentId: z.string(),
        advisorId: z.int(),
        languageId: z.string(),
        minMemorySimilarity: z.number().min(0).max(1).default(0.72),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { documentId, advisorId, languageId, minMemorySimilarity } = input;

      const document = assertSingleNonNullish(
        await drizzle
          .select({
            projectId: projectTable.id,
          })
          .from(documentTable)
          .innerJoin(
            projectTargetLanguage,
            eq(projectTargetLanguage.projectId, documentTable.projectId),
          )
          .innerJoin(projectTable, eq(projectTable.id, documentTable.projectId))
          .where(
            and(
              eq(documentTable.id, documentId),
              eq(projectTargetLanguage.languageId, languageId),
            ),
          )
          .limit(1),
      );

      if (!document)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Document does not exists or language does not claimed in project",
        });

      const task = assertSingleNonNullish(
        await drizzle
          .insert(taskTable)
          .values({
            type: "auto_translate",
            meta: {
              projectId: document.projectId,
              documentId,
            },
          })
          .returning({ id: taskTable.id }),
      );

      await autoTranslateQueue.add(
        task.id,
        {
          userId: user.id,
          documentId,
          advisorId,
          languageId,
          minMemorySimilarity,
        },
        {
          jobId: task.id,
        },
      );
    }),
});
