import * as z from "zod/v4";
import {
  TranslationSchema,
  TranslationVoteSchema,
} from "@cat/shared/schema/drizzle/translation";
import {
  assertSingleNonNullish,
  assertSingleOrNull,
  logger,
} from "@cat/shared/utils";
import {
  and,
  eq,
  isNull,
  project as projectTable,
  projectTargetLanguage,
  sql,
  sum,
  sumDistinct,
  translation as translationTable,
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
  inArray,
  qaResult,
  getColumns,
  qaResultItem,
} from "@cat/db";
import {
  autoTranslateWorkflow,
  CreateTranslationPubPayloadSchema,
  createTranslationWorkflow,
  getCreateTranslationPubKey,
} from "@cat/app-workers";
import { authed } from "@/orpc/server";
import {
  AsyncMessageQueue,
  firstOrGivenService,
} from "@cat/app-server-shared/utils";
import { ORPCError } from "@orpc/client";
import {
  QaResultItemSchema,
  QaResultSchema,
} from "@cat/shared/schema/drizzle/qa";

const TranslationDataSchema = TranslationSchema.omit({
  updatedAt: true,
  stringId: true,
}).extend({
  vote: z.int(),
  text: z.string(),
});

type TranslationData = z.infer<typeof TranslationDataSchema>;

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
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
      pluginManager,
    } = context;
    const { elementId, languageId, text, createMemory } = input;

    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!storage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider available",
      });
    }

    const { documentId } = assertSingleNonNullish(
      await drizzle
        .select({
          documentId: documentTable.id,
        })
        .from(translatableElementTable)
        .innerJoin(
          documentTable,
          eq(documentTable.id, translatableElementTable.documentId),
        )
        .where(eq(translatableElementTable.id, elementId)),
    );

    const memoryIds = (
      await drizzle
        .select({
          memoryId: memoryToProject.memoryId,
        })
        .from(translatableElementTable)
        .innerJoin(
          documentTable,
          eq(documentTable.id, translatableElementTable.documentId),
        )
        .innerJoin(
          memoryToProject,
          eq(memoryToProject.projectId, documentTable.projectId),
        )
        .where(eq(translatableElementTable.id, elementId))
    ).map((item) => item.memoryId);

    await createTranslationWorkflow.run({
      data: [
        {
          translatableElementId: elementId,
          text,
          languageId,
          translatorId: user.id,
        },
      ],
      memoryIds: createMemory ? memoryIds : [],
      pub: true,
      documentId,
      vectorStorageId: storage.id,
      vectorizerId: vectorizer.id,
    });
  });

export const onCreate = authed
  .input(
    z.object({
      documentId: z.string(),
    }),
  )
  .handler(async function* ({ context, input }) {
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redisSub },
    } = context;
    const { documentId } = input;

    const key = getCreateTranslationPubKey(documentId);
    const queue = new AsyncMessageQueue<TranslationData>();

    const onCreate = async (message: string) => {
      try {
        const { translationIds } =
          await CreateTranslationPubPayloadSchema.parseAsync(
            JSON.parse(message),
          );
        const translations = await drizzle
          .select({
            id: translationTable.id,
            translatableElementId: translationTable.translatableElementId,
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
            translationVoteTable,
            eq(translationVoteTable.translationId, translationTable.id),
          )
          .where(inArray(translationTable.id, translationIds))
          .groupBy(translationTable.id, translatableString.value);
        queue.push(...translations);
      } catch (err) {
        logger.error("RPC", { msg: "Invalid create translation payload" }, err);
      }
    };
    await redisSub.subscribe(key, onCreate);

    try {
      for await (const translations of queue.consume()) {
        yield translations;
      }
    } finally {
      await redisSub.unsubscribe(key);
      queue.clear();
    }
  });

export const getAll = authed
  .input(
    z.object({
      elementId: z.int(),
      languageId: z.string(),
    }),
  )
  .output(z.array(TranslationDataSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, languageId } = input;

    const translations = await drizzle
      .select({
        id: translationTable.id,
        translatableElementId: translationTable.translatableElementId,
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
      value: z.int(),
    }),
  )
  .output(TranslationVoteSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
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
  .output(z.number())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId, languageId } = input;

    const voteSum =
      sql<number>`COALESCE(SUM(${translationVoteTable.value}), 0)`.mapWith(
        Number,
      );

    return await drizzle.transaction(async (tx) => {
      const bestTranslations = await tx
        .selectDistinctOn([translationTable.translatableElementId], {
          elementId: translationTable.translatableElementId,
          translationId: translationTable.id,
          // voteCount: voteSum,
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
          translationVoteTable,
          eq(translationVoteTable.translationId, translationTable.id),
        )
        .where(
          and(
            eq(translatableElementTable.documentId, documentId),
            eq(translatableString.languageId, languageId),
            // 不自动批准已有被批准过的翻译的元素
            isNull(translatableElementTable.approvedTranslationId),
          ),
        )
        .groupBy(
          translationTable.id,
          translationTable.translatableElementId,
          translationTable.createdAt, // 排序
        )
        .orderBy(
          translationTable.translatableElementId,
          // 票数最高
          desc(voteSum),
          // 时间最新
          desc(translationTable.createdAt),
        );

      if (bestTranslations.length === 0) {
        return 0;
      }

      const updatePromises = bestTranslations.map((item) =>
        tx
          .update(translatableElementTable)
          .set({
            approvedTranslationId: item.translationId,
          })
          .where(eq(translatableElementTable.id, item.elementId)),
      );

      await Promise.all(updatePromises);

      return bestTranslations.length;
    });
  });

export const approve = authed
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

    await drizzle.transaction(async (tx) => {
      const { translatableElementId } = assertSingleNonNullish(
        await tx
          .select({
            id: translationTable.id,
            translatableElementId: translationTable.translatableElementId,
          })
          .from(translationTable)
          .where(eq(translationTable.id, translationId)),
      );

      await tx
        .update(translatableElementTable)
        .set({
          approvedTranslationId: translationId,
        })
        .where(eq(translatableElementTable.id, translatableElementId));
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

    await drizzle.transaction(async (tx) => {
      const { translatableElementId } = assertSingleNonNullish(
        await tx
          .select({
            translatableElementId: translationTable.translatableElementId,
          })
          .from(translationTable)
          .where(eq(translationTable.id, translationId)),
      );

      await tx
        .update(translatableElementTable)
        .set({
          approvedTranslationId: null,
        })
        .where(
          and(
            eq(translatableElementTable.id, translatableElementId),
            eq(translatableElementTable.approvedTranslationId, translationId),
          ),
        );
    });
  });

export const autoTranslate = authed
  .input(
    z.object({
      documentId: z.string(),
      advisorId: z.int(),
      languageId: z.string(),
      minMemorySimilarity: z.number().min(0).max(1).default(0.72),
      maxMemoryAmount: z.int().min(0).default(3),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
    } = context;
    const {
      documentId,
      advisorId,
      languageId,
      minMemorySimilarity,
      maxMemoryAmount,
    } = input;

    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");

    if (!storage)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `No VECTOR_STORAGE service available`,
      });

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
          maxMemoryAmount,
          memoryVectorStorageId: storage.id,
          translationVectorStorageId: storage.id,
          vectorizerId: storage.id,
        });
      }),
    );
  });

export const getQAResults = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(z.array(QaResultSchema))
  .handler(async ({ input, context }) => {
    const { translationId } = input;
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await drizzle
      .select(getColumns(qaResult))
      .from(qaResult)
      .where(eq(qaResult.translationId, translationId));
  });

export const getQAResultItems = authed
  .input(
    z.object({
      qaResultId: z.int(),
    }),
  )
  .output(z.array(QaResultItemSchema))
  .handler(async ({ input, context }) => {
    const { qaResultId } = input;
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await drizzle
      .select(getColumns(qaResultItem))
      .from(qaResultItem)
      .where(eq(qaResultItem.resultId, qaResultId));
  });
