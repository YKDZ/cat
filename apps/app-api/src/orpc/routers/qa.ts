import { authed } from "@/orpc/server.ts";
import z from "zod";
import { QAIssueSchema, TokenSchema, type QAIssue } from "@cat/plugin-core";
import { QAWorkflow } from "@cat/app-workers";
import { document, eq, glossaryToProject, project } from "@cat/db";
import { randomUUID } from "node:crypto";
import { AsyncMessageQueue } from "@cat/app-server-shared/utils";
import { logger } from "@cat/shared/utils";

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
      redisDB: { redisSub },
    } = context;
    const { documentId, source, translation } = input;

    const glossaryIds = (
      await drizzle
        .select({
          id: glossaryToProject.glossaryId,
        })
        .from(glossaryToProject)
        .innerJoin(document, eq(document.id, documentId))
        .innerJoin(project, eq(document.projectId, project.id))
        .where(eq(glossaryToProject.projectId, project.id))
    ).map((r) => r.id);

    const traceId = randomUUID();

    const issuesQueue = new AsyncMessageQueue<QAIssue>();
    const issueChannelKey = `qa:issue:${traceId}`;
    const onNewIssue = async (issueData: string) => {
      try {
        const issues = z.array(QAIssueSchema).parse(JSON.parse(issueData));
        issuesQueue.push(...issues);
      } catch (err) {
        logger.error("RPC", { msg: "Invalid issue format: " }, err);
      }
    };
    await redisSub.subscribe(issueChannelKey, onNewIssue);

    await QAWorkflow.run(
      { source, translation, glossaryIds, pub: true },
      {
        traceId,
      },
    );

    try {
      for await (const issue of issuesQueue.consume()) {
        yield issue;
      }
    } finally {
      await redisSub.unsubscribe(issueChannelKey);
      issuesQueue.clear();
    }
  });
