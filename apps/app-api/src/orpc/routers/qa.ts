import type { QaResultItem } from "@cat/shared/schema/drizzle/qa";

import {
  getGlobalGraphRuntime,
  QAPubPayloadSchema,
  qaGraph,
  startGraph,
} from "@cat/agent/workflow";
import { executeQuery, listDocumentGlossaryIds } from "@cat/domain";
import { TokenSchema } from "@cat/plugin-core";
import { AsyncMessageQueue } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
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

    const issuesQueue = new AsyncMessageQueue<
      Omit<QaResultItem, "id" | "createdAt" | "updatedAt" | "resultId">
    >();
    const { runId, complete } = await startGraph(qaGraph, {
      source,
      translation,
      glossaryIds,
      pub: true,
    });

    const unsubscribe = getGlobalGraphRuntime().eventBus.subscribe(
      "workflow:qa:issue",
      async (event) => {
        const parsed = QAPubPayloadSchema.safeParse(event.payload);
        if (!parsed.success) {
          logger
            .withSituation("RPC")
            .error(parsed.error, "Invalid issue format");
          return;
        }

        if (parsed.data.traceId !== runId) {
          return;
        }

        issuesQueue.push(
          ...parsed.data.result.filter((item) => !item.isPassed),
        );
      },
    );

    void complete
      .then(() => {
        issuesQueue.close();
      })
      .catch((err: unknown) => {
        logger.withSituation("RPC").error(err, "QA graph failed");
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
