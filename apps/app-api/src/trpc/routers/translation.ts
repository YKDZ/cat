import * as z from "zod/v4";
import { TRPCError } from "@trpc/server";
import {
  Translation,
  TranslationApprovementSchema,
  TranslationSchema,
  TranslationVoteSchema,
} from "@cat/shared/schema/drizzle/translation";
import { assertSingleNonNullish, assertSingleOrNull } from "@cat/shared/utils";
import {
  and,
  asc,
  count,
  eq,
  isNull,
  project as projectTable,
  projectTargetLanguage,
  sql,
  sum,
  sumDistinct,
  translation as translationTable,
  translationApprovement as translationApprovementTable,
  translationVote as translationVoteTable,
  translatableElement as translatableElementTable,
  translatableString,
  document as documentTable,
  task as taskTable,
  desc,
  memoryToProject,
  translationVote,
} from "@cat/db";
import {
  authedProcedure,
  permissionProcedure,
  permissionsProcedure,
  router,
} from "../server.ts";
import { DrizzleDateTimeSchema } from "@cat/shared/schema/misc";
import { safeZDotJson } from "@cat/shared/schema/json";

export const translationRouter = router({
  delete: permissionProcedure(
    "TRANSLATION",
    "delete.others",
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
  create: permissionsProcedure([
    {
      resourceType: "TRANSLATION",
      requiredPermission: "create",
    },
    {
      resourceType: "ELEMENT",
      requiredPermission: "translation.create",
      inputSchema: z.object({
        elementId: z.int(),
      }),
    },
  ])
    .input(
      z.object({
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
        workerRegistry,
        user,
      } = ctx;
      const { elementId, languageId, value, createMemory } = input;

      return await drizzle.transaction(async (tx) => {
        const memoryIds = (
          await drizzle
            .select({
              memoryId: memoryToProject.memoryId,
            })
            .from(memoryToProject)
            .innerJoin(
              documentTable,
              eq(documentTable.id, translatableElementTable.documentId),
            )
            .innerJoin(
              translatableElementTable,
              eq(translatableElementTable.id, elementId),
            )
            .where(
              and(
                eq(translatableElementTable.id, elementId),
                eq(documentTable.projectId, memoryToProject.projectId),
              ),
            )
        ).map((item) => item.memoryId);

        const task = assertSingleNonNullish(
          await tx
            .insert(taskTable)
            .values({
              type: "create_translation",
            })
            .returning({ id: taskTable.id }),
        );

        await workerRegistry.addJob(
          "create-translation",
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
          stringId: 0,
          meta: null,
          translatableElementId: elementId,
          translatorId: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: "PROCESSING",
        } satisfies Translation & { status: "PROCESSING" | "COMPLETED" };
      });
    }),
  getAll: permissionProcedure(
    "ELEMENT",
    "translation.get.all",
    z.object({
      elementId: z.int(),
    }),
  )
    .input(
      z.object({
        languageId: z.string(),
      }),
    )
    .output(
      z.array(
        z.object({
          id: z.int(),
          value: z.string(),
          vote: z.int(),
          translatorId: z.uuidv7(),
          meta: safeZDotJson,
          createdAt: DrizzleDateTimeSchema,
        }),
      ),
    )
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { elementId, languageId } = input;

      const translations = await drizzle
        .select({
          id: translationTable.id,
          value: translatableString.value,
          vote: sql<number>`COALESCE(${sumDistinct(translationVoteTable.value)}, 0)`.mapWith(
            Number,
          ),
          translatorId: translationTable.translatorId,
          meta: translationTable.meta,
          createdAt: translationTable.createdAt,
        })
        .from(translationTable)
        .innerJoin(
          translatableString,
          eq(translatableString.id, translationTable.stringId),
        )
        .leftJoin(
          translationApprovementTable,
          eq(translationApprovementTable.translationId, translationTable.id),
        )
        .leftJoin(
          translationVoteTable,
          eq(translationVoteTable.translationId, translationTable.id),
        )
        .where(
          and(
            eq(translatableString.languageId, languageId),
            eq(translationTable.translatableElementId, elementId),
          ),
        )
        .groupBy(translationTable.id, translatableString.value);

      return translations;
    }),
  vote: permissionProcedure(
    "TRANSLATION",
    "vote",
    z.object({
      translationId: z.int(),
    }),
  )
    .output(TranslationVoteSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { translationId } = input;

      // 一个人用户对同一个翻译只能投票一次
      return assertSingleNonNullish(
        await drizzle
          .insert(translationVoteTable)
          .values({
            value: 1,
            translationId,
            voterId: user.id,
          })
          .onConflictDoUpdate({
            target: [
              translationVoteTable.translationId,
              translationVoteTable.voterId,
            ],
            set: {
              value: 1,
              translationId,
              voterId: user.id,
            },
          })
          .returning(),
      );
    }),
  countVote: permissionProcedure(
    "TRANSLATION",
    "vote.count",
    z.object({
      translationId: z.int(),
    }),
  )
    .output(z.number().int())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { translationId } = input;

      const { total } = assertSingleNonNullish(
        await drizzle
          .select({
            total: sum(translationVoteTable.value),
          })
          .from(translationVoteTable)
          .where(eq(translationVoteTable.translationId, translationId)),
      );

      if (!total) return 0;

      return Number(total);
    }),
  getSelfVote: permissionProcedure(
    "TRANSLATION",
    "vote.get.self",
    z.object({
      translationId: z.int(),
    }),
  )
    .output(TranslationVoteSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { translationId } = input;

      return assertSingleOrNull(
        await drizzle
          .select()
          .from(translationVote)
          .where(
            and(
              eq(translationVote.translationId, translationId),
              eq(translationVote.voterId, user.id),
            ),
          ),
      );
    }),
  autoApprove: permissionsProcedure([
    {
      resourceType: "TRANSLATION",
      requiredPermission: "auto-approve",
    },
    {
      resourceType: "DOCUMENT",
      requiredPermission: "auto-approve",
      inputSchema: z.object({
        documentId: z.uuidv7(),
      }),
    },
  ])
    .input(
      z.object({
        languageId: z.string(),
      }),
    )
    .output(z.int())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { documentId, languageId } = input;

      const voteSum =
        sql<number>`COALESCE(SUM(${translationVoteTable.value}), 0)`.mapWith(
          Number,
        );

      return await drizzle.transaction(async (tx) => {
        const topTranslations = await tx
          .selectDistinctOn([translationTable.translatableElementId], {
            translationId: translationTable.id,
            elementId: translationTable.translatableElementId,
            voteCount: voteSum,
          })
          .from(translationTable)
          .innerJoin(
            translatableElementTable,
            eq(
              translationTable.translatableElementId,
              translatableElementTable.id,
            ),
          )
          .innerJoin(
            translatableString,
            eq(translationTable.stringId, translatableString.id),
          )
          .leftJoin(
            translationApprovementTable,
            eq(translationApprovementTable.translationId, translationTable.id),
          )
          .leftJoin(
            translationVoteTable,
            eq(translationVoteTable.translationId, translationTable.id),
          )
          .where(
            and(
              eq(translatableElementTable.documentId, documentId),
              eq(translatableString.languageId, languageId),
              isNull(translationApprovementTable.id),
            ),
          )
          .groupBy(translationTable.id, translationTable.translatableElementId)
          .orderBy(
            translationTable.translatableElementId,
            desc(voteSum),
            asc(translationTable.id),
          );

        const translationIds = topTranslations.map(
          ({ translationId }) => translationId,
        );

        if (translationIds.length === 0) return 0;

        const insertedRows = await tx
          .insert(translationApprovementTable)
          .values(
            translationIds.map((id) => ({
              translationId: id,
              isActive: true,
              creatorId: user.id,
            })),
          )
          .returning({ id: translationApprovementTable.id });

        return insertedRows.length;
      });
    }),
  approve: permissionProcedure(
    "TRANSLATION",
    "approve.others",
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
  unapprove: permissionProcedure(
    "TRANSLATION",
    "unapprove",
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
        workerRegistry,
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

      await workerRegistry.executeFlow(
        "auto-translate-flow",
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
  isApproved: permissionProcedure(
    "TRANSLATION",
    "is-approved.get.others",
    z.object({
      translationId: z.int(),
    }),
  )
    .output(z.boolean())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { translationId } = input;

      const { exists } = assertSingleNonNullish(
        await drizzle
          .select({ exists: count() })
          .from(translationApprovementTable)
          .where(
            and(
              eq(translationApprovementTable.translationId, translationId),
              eq(translationApprovementTable.isActive, true),
            ),
          ),
      );

      return exists > 0;
    }),
});
