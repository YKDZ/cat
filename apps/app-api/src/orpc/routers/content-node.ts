import type { VCSContext } from "@cat/vcs";

import {
  countContentNodeTranslations,
  deleteContentNode,
  executeCommand,
  executeQuery,
  getContentNode,
} from "@cat/domain";
import { ContentNodeSchema } from "@cat/shared";
import { readWithOverlay } from "@cat/vcs";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import { authed, checkContentNodePermission } from "@/orpc/server";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

export const get = authed
  .input(z.object({ contentNodeId: z.uuidv4(), branchId: z.int().optional() }))
  .use(checkContentNodePermission("viewer"), (i) => i.contentNodeId)
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(ContentNodeSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    if (context.branchId !== undefined) {
      const overlayEntry = await readWithOverlay<
        z.infer<typeof ContentNodeSchema>
      >(drizzle, context.branchId, "content_node", input.contentNodeId);
      if (overlayEntry !== null) {
        if (overlayEntry.action === "DELETE") return null;
        return overlayEntry.data;
      }
    }

    return executeQuery({ db: drizzle }, getContentNode, {
      id: input.contentNodeId,
    });
  });

export const del = authed
  .input(z.object({ contentNodeId: z.uuidv4(), branchId: z.int().optional() }))
  .use(checkContentNodePermission("editor"), (i) => i.contentNodeId)
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    if (
      context.branchId !== undefined &&
      context.branchChangesetId !== undefined
    ) {
      if (context.branchProjectId === undefined) {
        throw new Error(
          "branchProjectId missing when branch context is active",
        );
      }

      const { middleware } = createVCSRouteHelper(drizzle);
      const currentNode = await executeQuery({ db: drizzle }, getContentNode, {
        id: input.contentNodeId,
      });

      await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        } satisfies VCSContext,
        "content_node",
        input.contentNodeId,
        "DELETE",
        currentNode,
        null,
        async () => undefined,
      );

      return;
    }

    await executeCommand({ db: drizzle }, deleteContentNode, {
      contentNodeId: input.contentNodeId,
    });
  });

export const countTranslation = authed
  .input(
    z.object({
      contentNodeId: z.uuidv4(),
      languageId: z.string(),
      isApproved: z.boolean().optional(),
    }),
  )
  .use(checkContentNodePermission("viewer"), (i) => i.contentNodeId)
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return executeQuery({ db: drizzle }, countContentNodeTranslations, input);
  });
