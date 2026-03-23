import {
  CreateTranslationPubPayloadSchema,
  autoTranslateGraph,
  createTranslationGraph,
  getGlobalGraphRuntime,
  runGraph,
} from "@cat/agent/workflow";
import {
  approveTranslation,
  autoApproveDocumentTranslations,
  deleteTranslation,
  executeCommand,
  executeQuery,
  getDocument,
  getElementWithChunkIds,
  getProjectTargetLanguages,
  getSelfTranslationVote,
  getTranslationVoteTotal,
  listDocumentElementsWithChunkIds,
  listMemoryIdsByProject,
  listProjectGlossaryIds,
  listQaResultItems,
  listQaResultsByTranslation,
  listTranslationsByIds,
  listTranslationsByElement,
  unapproveTranslation,
  upsertTranslationVote,
} from "@cat/domain";
import { AsyncMessageQueue, firstOrGivenService } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import {
  QaResultItemSchema,
  QaResultSchema,
} from "@cat/shared/schema/drizzle/qa";
import {
  TranslationSchema,
  TranslationVoteSchema,
} from "@cat/shared/schema/drizzle/translation";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

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

    await executeCommand({ db: drizzle }, deleteTranslation, input);
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

    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      {
        elementId,
      },
    );

    if (!element) {
      throw new ORPCError("NOT_FOUND", {
        message: `Element ${elementId} not found`,
      });
    }

    const memoryIds = await executeQuery(
      { db: drizzle },
      listMemoryIdsByProject,
      { projectId: element.projectId },
    );

    await runGraph(
      createTranslationGraph,
      {
        data: [
          {
            translatableElementId: elementId,
            text,
            languageId,
            translatorId: user.id,
          },
        ],
        memoryIds: createMemory ? memoryIds : [],
        documentId: element.documentId,
        vectorStorageId: storage.id,
        vectorizerId: vectorizer.id,
        translatorId: user.id,
      },
      {
        pluginManager,
      },
    );
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
    } = context;
    const { documentId } = input;

    const queue = new AsyncMessageQueue<TranslationData>();

    const unsubscribe = getGlobalGraphRuntime().eventBus.subscribe(
      "workflow:translation:created",
      async (event) => {
        const parsed = await CreateTranslationPubPayloadSchema.safeParseAsync(
          event.payload,
        );
        if (!parsed.success) {
          logger
            .withSituation("RPC")
            .error(parsed.error, "Invalid create translation payload");
          return;
        }

        if (parsed.data.documentId !== documentId) {
          return;
        }

        const translations = await executeQuery(
          { db: drizzle },
          listTranslationsByIds,
          { translationIds: parsed.data.translationIds },
        );
        queue.push(...translations);
      },
    );

    try {
      for await (const translations of queue.consume()) {
        yield translations;
      }
    } finally {
      unsubscribe();
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

    return await executeQuery({ db: drizzle }, listTranslationsByElement, {
      elementId,
      languageId,
    });
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

    return await executeCommand({ db: drizzle }, upsertTranslationVote, {
      translationId,
      voterId: user.id,
      value,
    });
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

    return await executeQuery({ db: drizzle }, getTranslationVoteTotal, input);
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

    return await executeQuery({ db: drizzle }, getSelfTranslationVote, {
      translationId,
      voterId: user.id,
    });
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
    } = context;

    return await executeCommand(
      { db: drizzle },
      autoApproveDocumentTranslations,
      input,
    );
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
    await executeCommand({ db: drizzle }, approveTranslation, input);
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
    await executeCommand({ db: drizzle }, unapproveTranslation, input);
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
      user,
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

    const document = await executeQuery({ db: drizzle }, getDocument, {
      documentId,
    });

    if (!document) {
      throw new ORPCError("NOT_FOUND", {
        message: `Document ${documentId} not found`,
      });
    }

    const targetLanguages = await executeQuery(
      { db: drizzle },
      getProjectTargetLanguages,
      { projectId: document.projectId },
    );

    if (!targetLanguages.some((item) => item.id === languageId)) {
      throw new ORPCError("BAD_REQUEST", {
        message:
          "Document does not exists or language does not claimed in project",
      });
    }

    const [memoryIds, glossaryIds, elements] = await Promise.all([
      executeQuery({ db: drizzle }, listMemoryIdsByProject, {
        projectId: document.projectId,
      }),
      executeQuery({ db: drizzle }, listProjectGlossaryIds, {
        projectId: document.projectId,
      }),
      executeQuery({ db: drizzle }, listDocumentElementsWithChunkIds, {
        documentId,
      }),
    ]);

    await Promise.all(
      elements.map(async (element) => {
        await runGraph(
          autoTranslateGraph,
          {
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
            translatorId: user.id,
            documentId,
          },
          {
            pluginManager,
          },
        );
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

    return await executeQuery({ db: drizzle }, listQaResultsByTranslation, {
      translationId,
    });
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

    return await executeQuery({ db: drizzle }, listQaResultItems, {
      qaResultId,
    });
  });
