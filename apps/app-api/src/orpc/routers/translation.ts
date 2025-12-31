import * as z from "zod/v4";
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
  desc,
  memoryToProject,
  translationVote,
  chunkSet,
  glossaryToProject,
  chunk,
} from "@cat/db";
import {
  autoTranslateWorkflow,
  createTranslationWorkflow,
} from "@cat/app-workers";
import { authed } from "@/orpc/server";
import { ORPCError } from "@orpc/client";

export const translationRouter = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { translationId } = input;

    await drizzle
      .delete(translationTable)
      .where(eq(translationTable.id, translationId));
  });

export const create = authed
  .input(
    z.object({
      elementId: z.int(),
      languageId: z.string(),
      text: z.string(),
      createMemory: z.boolean().default(true),
    }),
  )
  .output(
    TranslationSchema.extend({
      status: z.enum(["PROCESSING", "COMPLETED"]),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { elementId, languageId, text, createMemory } = input;

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

    await createTranslationWorkflow.run({
      data: [
        {
          translatableElementId: elementId,
          text,
          languageId,
        },
      ],
      memoryIds: createMemory ? memoryIds : [],
    });

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

export const getAll = authed
  .input(
    z.object({
      elementId: z.int(),
      languageId: z.string(),
    }),
  )
  .output(
    z.array(
      TranslationSchema.omit({
        translatableElementId: true,
        updatedAt: true,
        stringId: true,
      }).extend({
        vote: z.int(),
        text: z.string(),
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, languageId } = input;

    const translations = await drizzle
      .select({
        id: translationTable.id,
        text: translatableString.value,
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
  });

export const vote = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(TranslationVoteSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
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
  });

export const countVote = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
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
  });

export const getSelfVote = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(TranslationVoteSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
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
  });

export const autoApprove = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      languageId: z.string(),
    }),
  )
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
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
  });

export const approve = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(TranslationApprovementSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
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
        throw new ORPCError("BAD_REQUEST", {
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
  });

export const unapprove = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { translationId } = input;

    await drizzle
      .update(translationApprovementTable)
      .set({ isActive: false })
      .where(eq(translationApprovementTable.id, translationId));
  });

export const autoTranslate = authed
  .input(
    z.object({
      documentId: z.string(),
      advisorId: z.int(),
      languageId: z.string(),
      minMemorySimilarity: z.number().min(0).max(1).default(0.72),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
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
      `Document does not exists or language does not claimed in project`,
    );

    const memoryIds = (
      await drizzle
        .select({
          id: memoryToProject.memoryId,
        })
        .from(memoryToProject)
        .where(eq(memoryToProject.projectId, document.projectId))
    ).map((row) => row.id);

    const glossaryIds = (
      await drizzle
        .select({
          id: glossaryToProject.glossaryId,
        })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, document.projectId))
    ).map((row) => row.id);

    const elements = await drizzle
      .select({
        id: translatableElementTable.id,
        value: translatableString.value,
        languageId: translatableString.languageId,
        chunkIds: sql<
          number[]
        >`coalesce(array_agg("Chunk"."id"), ARRAY[]::int[])`,
      })
      .from(translatableElementTable)
      .innerJoin(
        translatableString,
        eq(
          translatableElementTable.translatableStringId,
          translatableString.id,
        ),
      )
      .innerJoin(chunkSet, eq(translatableString.chunkSetId, chunkSet.id))
      .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
      .where(eq(translatableElementTable.documentId, documentId))
      .groupBy(
        translatableElementTable.id,
        translatableString.value,
        translatableString.languageId,
      );

    await Promise.all(
      elements.map(async (element) => {
        await autoTranslateWorkflow.run({
          translationLanguageId: languageId,
          translatableElementId: element.id,
          advisorId,
          text: element.value,
          sourceLanguageId: element.languageId,
          memoryIds,
          glossaryIds,
          chunkIds: element.chunkIds,
          minMemorySimilarity,
        });
      }),
    );
  });

export const isApproved = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(z.boolean())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
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
  });
