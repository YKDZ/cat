import type { VCSContext } from "@cat/vcs";

import {
  createComment,
  deleteComment as deleteCommentCommand,
  deleteCommentReaction,
  executeCommand,
  executeQuery,
  listChildComments,
  listCommentReactions,
  listRootComments,
  upsertCommentReaction,
} from "@cat/domain";
import { CommentSchema, CommentReactionSchema } from "@cat/shared";
import {
  CommentReactionTypeSchema,
  CommentTargetTypeSchema,
} from "@cat/shared";
import { listWithOverlay } from "@cat/vcs";
import { ORPCError } from "@orpc/server";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import { authed } from "@/orpc/server";
import {
  createVCSRouteHelper,
  ensureBranchWriteContext,
} from "@/utils/vcs-route-helper";

export const comment = authed
  .input(
    z.object({
      targetType: CommentTargetTypeSchema,
      targetId: z.int(),
      parentCommentId: z.int().optional(),
      content: z.string(),
      languageId: z.string(),
      branchId: z.int().optional(),
      /** @zh 项目 ID（用于 Direct 模式 VCS 审计） @en Project ID for Direct mode VCS audit */
      projectId: z.uuid().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectId,
  }))
  .output(CommentSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    if (context.branchId !== undefined && input.projectId === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "projectId is required when branchId is provided",
      });
    }

    if (context.branchId !== undefined) {
      const branchWriteContext = await ensureBranchWriteContext({
        drizzle,
        branchId: context.branchId,
        branchChangesetId: context.branchChangesetId,
        branchProjectId: context.branchProjectId,
      });

      if (!branchWriteContext) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Invalid branch context for comment creation",
        });
      }

      const { middleware } = createVCSRouteHelper(drizzle);
      const entityId = crypto.randomUUID();
      const commentData = {
        targetType: input.targetType,
        targetId: input.targetId,
        content: input.content,
        languageId: input.languageId,
        userId: user.id,
      };
      return await middleware.interceptWrite(
        branchWriteContext,
        "comment",
        entityId,
        "CREATE",
        null,
        commentData,
        async () => ({
          id: 0,
          parentCommentId: null,
          rootCommentId: null,
          ...commentData,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    }

    if (input.projectId !== undefined) {
      const { middleware } = createVCSRouteHelper(drizzle);
      const entityId = crypto.randomUUID();
      const vcsCtx: VCSContext = {
        mode: "direct",
        projectId: input.projectId,
        createdBy: user.id,
      };
      return await middleware.interceptWrite(
        vcsCtx,
        "comment",
        entityId,
        "CREATE",
        null,
        {
          targetType: input.targetType,
          targetId: input.targetId,
          content: input.content,
          languageId: input.languageId,
          userId: user.id,
        },
        async () =>
          executeCommand({ db: drizzle }, createComment, {
            ...input,
            userId: user.id,
          }),
      );
    }

    return await executeCommand({ db: drizzle }, createComment, {
      ...input,
      userId: user.id,
    });
  });

export const getRootComments = authed
  .input(
    z.object({
      targetType: CommentTargetTypeSchema,
      targetId: z.int(),
      pageIndex: z.int().nonnegative(),
      pageSize: z.int().positive(),
      branchId: z.int().optional(),
      projectId: z.uuidv4().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectId,
  }))
  .output(z.array(CommentSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    if (context.branchId !== undefined && input.projectId === undefined) {
      throw new ORPCError("BAD_REQUEST", {
        message: "projectId is required when branchId is provided",
      });
    }

    const mainItems = await executeQuery(
      { db: drizzle },
      listRootComments,
      input,
    );

    if (context.branchId !== undefined) {
      return await listWithOverlay(
        drizzle,
        context.branchId,
        "comment",
        mainItems,
        (item) => String(item.id),
      );
    }

    return mainItems;
  });

export const getChildComments = authed
  .input(
    z.object({
      rootCommentId: z.int(),
    }),
  )
  .output(z.array(CommentSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listChildComments, input);
  });

export const getCommentReactions = authed
  .input(
    z.object({
      commentId: z.int(),
    }),
  )
  .output(z.array(CommentReactionSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listCommentReactions, input);
  });

export const react = authed
  .input(
    z.object({
      commentId: z.int(),
      type: CommentReactionTypeSchema,
    }),
  )
  .output(CommentReactionSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    return await executeCommand({ db: drizzle }, upsertCommentReaction, {
      ...input,
      userId: user.id,
    });
  });

export const unReact = authed
  .input(
    z.object({
      commentId: z.int(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    await executeCommand({ db: drizzle }, deleteCommentReaction, {
      commentId: input.commentId,
      userId: user.id,
    });
  });

export const deleteComment = authed
  .input(
    z.object({
      commentId: z.int(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    await executeCommand({ db: drizzle }, deleteCommentCommand, {
      commentId: input.commentId,
      userId: user.id,
    });
  });
