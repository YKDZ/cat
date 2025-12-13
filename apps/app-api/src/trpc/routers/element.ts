import {
  permissionProcedure,
  permissionsProcedure,
  router,
} from "@/trpc/server";
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

export const elementRouter = router({
  getContexts: permissionProcedure(
    "ELEMENT",
    "element.get.context",
    z.object({
      elementId: z.int(),
    }),
  )
    .output(z.array(TranslatableElementContextSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
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
          .where(
            eq(translatableElementContext.translatableElementId, elementId),
          );

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
    }),
  comment: permissionsProcedure([
    {
      resourceType: "ELEMENT",
      requiredPermission: "element.create.comment",
      inputSchema: z.object({
        elementId: z.int(),
      }),
    },
    {
      resourceType: "COMMENT",
      requiredPermission: "create",
    },
  ])
    .input(
      z.object({
        parentCommentId: z.int().optional(),
        content: z.string(),
        languageId: z.string(),
      }),
    )
    .output(TranslatableElementCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
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
    }),
  getRootComments: permissionProcedure(
    "ELEMENT",
    "element.comment.get",
    z.object({
      elementId: z.int(),
    }),
  )
    .input(
      z.object({
        pageIndex: z.int().nonnegative(),
        pageSize: z.int().positive(),
      }),
    )
    .output(z.array(TranslatableElementCommentSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
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
    }),
  getChildComments: permissionProcedure(
    "COMMENT",
    "get",
    z.object({
      rootCommentId: z.int(),
    }),
  )
    .output(z.array(TranslatableElementCommentSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
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
    }),
  getCommentReactions: permissionProcedure(
    "COMMENT",
    "get",
    z.object({
      commentId: z.int(),
    }),
  )
    .output(z.array(TranslatableElementCommentReactionSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
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
    }),
  react: permissionProcedure(
    "COMMENT",
    "create.react",
    z.object({
      commentId: z.int(),
    }),
  )
    .input(
      z.object({
        type: TranslatableElementCommentReactionTypeSchema,
      }),
    )
    .output(TranslatableElementCommentReactionSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
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
    }),
  unReact: permissionProcedure(
    "COMMENT",
    "delete.react",
    z.object({
      commentId: z.int(),
    }),
  )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
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
    }),
  deleteComment: permissionProcedure(
    "COMMENT",
    "delete",
    z.object({
      commentId: z.int(),
    }),
  )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { commentId } = input;

      await drizzle
        .delete(translatableElementComment)
        .where(
          and(
            eq(translatableElementComment.id, commentId),
            eq(translatableElementComment.userId, user.id),
          ),
        );
    }),
});
