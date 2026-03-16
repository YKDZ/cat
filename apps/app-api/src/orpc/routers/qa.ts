import type { QaResultItem } from "@cat/shared/schema/drizzle/qa";

import {
  getWorkflowRuntime,
  QAPubPayloadSchema,
  qaWorkflow,
} from "@cat/app-agent/workflow";
import { executeQuery, listDocumentGlossaryIds } from "@cat/domain";
import { TokenSchema } from "@cat/plugin-core";
import { AsyncMessageQueue } from "@cat/server-shared";
import { logger } from "@cat/shared/utils";
import { randomUUID } from "node:crypto";
import z from "zod";

import { authed } from "@/orpc/server.ts";

export const check = authed
  .input(
    z.object({
      source: z.object({
        languageId: z.string(),
        text: z.string(),
        tokens: z.array(TokenSchema),
      }),
      translation: z.object({
        languageId: z.string(),
        text: z.string(),
        tokens: z.array(TokenSchema),
      }),
      documentId: z.uuidv4(),
    }),
  )
  .handler(async function* ({ context, input }) {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId, source, translation } = input;

    const glossaryIds = await executeQuery(
      { db: drizzle },
      listDocumentGlossaryIds,
      { documentId },
    );

    const traceId = randomUUID();

    const issuesQueue = new AsyncMessageQueue<
      Omit<QaResultItem, "id" | "createdAt" | "updatedAt" | "resultId">
    >();
    const unsubscribe = getWorkflowRuntime().eventBus.subscribe(
      "workflow:qa:issue",
      async (event) => {
        const parsed = QAPubPayloadSchema.safeParse(event.payload);
        if (!parsed.success) {
          logger.error("RPC", { msg: "Invalid issue format" }, parsed.error);
          return;
        }

        if (parsed.data.traceId !== traceId) {
          return;
        }

        issuesQueue.push(
          ...parsed.data.result.filter((item) => !item.isPassed),
        );
      },
    );

    const runPromise = qaWorkflow.run(
      { source, translation, glossaryIds, pub: true },
      {
        traceId,
      },
    );

    void runPromise
      .then(async ({ result }) => {
        await result();
        issuesQueue.close();
      })
      .catch((err: unknown) => {
        logger.error("RPC", { msg: "QA workflow failed" }, err);
        issuesQueue.close();
      });

    try {
      for await (const issue of issuesQueue.consume()) {
        yield issue;
      }
    } finally {
      unsubscribe();
      issuesQueue.clear();
    }
  });
