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
import {
  CommentSchema,
  CommentReactionSchema,
} from "@cat/shared/schema/drizzle/comment";
import {
  CommentReactionTypeSchema,
  CommentTargetTypeSchema,
} from "@cat/shared/schema/enum";
import { listWithOverlay } from "@cat/vcs";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import { authed } from "@/orpc/server";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

export const comment = authed
  .input(
    z.object({
      targetType: CommentTargetTypeSchema,
      targetId: z.int(),
      parentCommentId: z.int().optional(),
      content: z.string(),
      languageId: z.string(),
      branchId: z.number().int().optional(),
      /** @zh 项目 ID（用于 Direct 模式 VCS 审计） @en Project ID for Direct mode VCS audit */
      projectId: z.string().uuid().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(CommentSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
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
      const entityId = crypto.randomUUID();
      const commentData = {
        targetType: input.targetType,
        targetId: input.targetId,
        content: input.content,
        languageId: input.languageId,
        userId: user.id,
      };
      return await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
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
      branchId: z.number().int().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(z.array(CommentSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

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
