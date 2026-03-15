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
} from "@cat/shared/schema/drizzle/enum";
import * as z from "zod";

import { authed } from "@/orpc/server";

export const comment = authed
  .input(
    z.object({
      targetType: CommentTargetTypeSchema,
      targetId: z.int(),
      parentCommentId: z.int().optional(),
      content: z.string(),
      languageId: z.string(),
    }),
  )
  .output(CommentSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

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
    }),
  )
  .output(z.array(CommentSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listRootComments, input);
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
