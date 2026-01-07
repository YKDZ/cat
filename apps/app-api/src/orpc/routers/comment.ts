import { authed } from "@/orpc/server";
import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  comment as commentTable,
  commentReaction,
} from "@cat/db";
import {
  CommentSchema,
  CommentReactionSchema,
} from "@cat/shared/schema/drizzle/comment";
import {
  CommentReactionTypeSchema,
  CommentTargetTypeSchema,
} from "@cat/shared/schema/drizzle/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

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
    const { targetType, targetId, content, parentCommentId, languageId } =
      input;

    const comment = assertSingleNonNullish(
      await drizzle
        .insert(commentTable)
        .values({
          targetType,
          targetId,
          userId: user.id,
          content,
          parentCommentId,
          languageId,
        })
        .returning(),
    );

    return comment;
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
    const { targetType, targetId, pageIndex, pageSize } = input;

    const comments = await drizzle
      .select()
      .from(commentTable)
      .where(
        and(
          eq(commentTable.targetType, targetType),
          eq(commentTable.targetId, targetId),
          isNull(commentTable.parentCommentId),
        ),
      )
      .orderBy(desc(commentTable.createdAt))
      .offset(pageIndex * pageSize)
      .limit(pageSize);

    return comments;
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
    const { rootCommentId } = input;

    const childComments = await drizzle
      .select()
      .from(commentTable)
      .where(
        and(
          eq(commentTable.rootCommentId, rootCommentId),
          isNotNull(commentTable.parentCommentId),
        ),
      )
      .orderBy(desc(commentTable.createdAt));

    return childComments;
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
    const { commentId } = input;

    const reactions = await drizzle
      .select()
      .from(commentReaction)
      .where(eq(commentReaction.commentId, commentId));

    return reactions;
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
    const { commentId, type } = input;

    const reaction = assertSingleNonNullish(
      await drizzle
        .insert(commentReaction)
        .values({
          commentId: commentId,
          userId: user.id,
          type,
        })
        .onConflictDoUpdate({
          target: [commentReaction.commentId, commentReaction.userId],
          set: {
            type,
          },
        })
        .returning(),
    );

    return reaction;
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
    const { commentId } = input;

    await drizzle
      .delete(commentReaction)
      .where(
        and(
          eq(commentReaction.commentId, commentId),
          eq(commentReaction.userId, user.id),
        ),
      );
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
    const { commentId } = input;

    await drizzle
      .delete(commentTable)
      .where(
        and(eq(commentTable.id, commentId), eq(commentTable.userId, user.id)),
      );
  });
