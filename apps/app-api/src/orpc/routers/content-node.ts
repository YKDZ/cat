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
import { ORPCError } from "@orpc/server";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import { authed, checkContentNodePermission } from "@/orpc/server";
import {
  createVCSRouteHelper,
  ensureBranchWriteContext,
} from "@/utils/vcs-route-helper";

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
        if (
          context.branchProjectId !== undefined &&
          overlayEntry.data.projectId !== context.branchProjectId
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message: `Branch ${context.branchId} does not belong to content node project ${overlayEntry.data.projectId}`,
          });
        }
        return overlayEntry.data;
      }
    }

    const currentNode = await executeQuery({ db: drizzle }, getContentNode, {
      id: input.contentNodeId,
    });

    if (
      currentNode &&
      context.branchProjectId !== undefined &&
      currentNode.projectId !== context.branchProjectId
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Branch ${context.branchId} does not belong to content node project ${currentNode.projectId}`,
      });
    }

    return currentNode;
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

    if (context.branchId !== undefined) {
      const currentNode = await executeQuery({ db: drizzle }, getContentNode, {
        id: input.contentNodeId,
      });

      if (
        currentNode &&
        context.branchProjectId !== undefined &&
        currentNode.projectId !== context.branchProjectId
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Branch ${context.branchId} does not belong to content node project ${currentNode.projectId}`,
        });
      }

      const branchWriteContext = await ensureBranchWriteContext({
        drizzle,
        branchId: context.branchId,
        branchChangesetId: context.branchChangesetId,
        branchProjectId: context.branchProjectId,
      });

      if (!branchWriteContext) {
        throw new Error("branch write context missing for branch delete");
      }

      const { middleware } = createVCSRouteHelper(drizzle);

      await middleware.interceptWrite(
        branchWriteContext satisfies VCSContext,
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
