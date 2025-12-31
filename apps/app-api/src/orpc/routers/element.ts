import { authed } from "@/orpc/server";
import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  translatableElement,
  translatableElementComment,
  translatableElementCommentReaction,
  translatableElementContext,
} from "@cat/db";
import {
  TranslatableElementCommentSchema,
  TranslatableElementCommentReactionSchema,
  TranslatableElementContextSchema,
  type TranslatableElementContext,
} from "@cat/shared/schema/drizzle/document";
import { TranslatableElementCommentReactionTypeSchema } from "@cat/shared/schema/drizzle/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

export const getContexts = authed
  .input(
    z.object({
      elementId: z.int(),
    }),
  )
  .output(z.array(TranslatableElementContextSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId } = input;

    const { element, contexts } = await drizzle.transaction(async (tx) => {
      const element = assertSingleNonNullish(
        await tx
          .select({
            meta: translatableElement.meta,
            createdAt: translatableElement.createdAt,
            updatedAt: translatableElement.updatedAt,
          })
          .from(translatableElement)
          .where(eq(translatableElement.id, elementId)),
        `Element with ID ${elementId} not found`,
      );

      const contexts = await tx
        .select()
        .from(translatableElementContext)
        .where(eq(translatableElementContext.translatableElementId, elementId));

      return { element, contexts };
    });

    const metaContext = {
      id: -1,
      jsonData: element.meta,
      createdAt: element.createdAt,
      updatedAt: element.updatedAt,
      translatableElementId: elementId,
      type: "JSON",
      fileId: null,
      storageProviderId: null,
      textData: null,
    } satisfies TranslatableElementContext;

    return [metaContext, ...contexts];
  });

export const comment = authed
  .input(
    z.object({
      elementId: z.int(),
      parentCommentId: z.int().optional(),
      content: z.string(),
      languageId: z.string(),
    }),
  )
  .output(TranslatableElementCommentSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { elementId, content, parentCommentId, languageId } = input;

    const comment = assertSingleNonNullish(
      await drizzle
        .insert(translatableElementComment)
        .values({
          translatableElementId: elementId,
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
      elementId: z.int(),
      pageIndex: z.int().nonnegative(),
      pageSize: z.int().positive(),
    }),
  )
  .output(z.array(TranslatableElementCommentSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, pageIndex, pageSize } = input;

    const comments = await drizzle
      .select()
      .from(translatableElementComment)
      .where(
        and(
          eq(translatableElementComment.translatableElementId, elementId),
          isNull(translatableElementComment.parentCommentId),
        ),
      )
      .orderBy(desc(translatableElementComment.createdAt))
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
  .output(z.array(TranslatableElementCommentSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { rootCommentId } = input;

    const childComments = await drizzle
      .select()
      .from(translatableElementComment)
      .where(
        and(
          eq(translatableElementComment.rootCommentId, rootCommentId),
          isNotNull(translatableElementComment.parentCommentId),
        ),
      )
      .orderBy(desc(translatableElementComment.createdAt));

    return childComments;
  });

export const getCommentReactions = authed
  .input(
    z.object({
      commentId: z.int(),
    }),
  )
  .output(z.array(TranslatableElementCommentReactionSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { commentId } = input;

    const reactions = await drizzle
      .select()
      .from(translatableElementCommentReaction)
      .where(
        eq(
          translatableElementCommentReaction.translatableElementCommentId,
          commentId,
        ),
      );

    return reactions;
  });

export const react = authed
  .input(
    z.object({
      commentId: z.int(),
      type: TranslatableElementCommentReactionTypeSchema,
    }),
  )
  .output(TranslatableElementCommentReactionSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { commentId, type } = input;

    const reaction = assertSingleNonNullish(
      await drizzle
        .insert(translatableElementCommentReaction)
        .values({
          translatableElementCommentId: commentId,
          userId: user.id,
          type,
        })
        .onConflictDoUpdate({
          target: [
            translatableElementCommentReaction.translatableElementCommentId,
            translatableElementCommentReaction.userId,
          ],
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
      .delete(translatableElementCommentReaction)
      .where(
        and(
          eq(
            translatableElementCommentReaction.translatableElementCommentId,
            commentId,
          ),
          eq(translatableElementCommentReaction.userId, user.id),
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
      .delete(translatableElementComment)
      .where(
        and(
          eq(translatableElementComment.id, commentId),
          eq(translatableElementComment.userId, user.id),
        ),
      );
  });
