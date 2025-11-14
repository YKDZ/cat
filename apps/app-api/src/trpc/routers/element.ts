import { authedProcedure, router } from "@/trpc/server";
import {
  and,
  eq,
  isNull,
  translatableElement,
  translatableElementComment,
  translatableElementContext,
} from "@cat/db";
import {
  TranslatableElementCommentSchema,
  TranslatableElementContextSchema,
  type TranslatableElementContext,
} from "@cat/shared/schema/drizzle/document";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

export const elementRouter = router({
  getContexts: authedProcedure
    .input(
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
  comment: authedProcedure
    .input(
      z.object({
        elementId: z.int(),
        content: z.string(),
        parentCommentId: z.int().optional(),
      }),
    )
    .output(TranslatableElementCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const { elementId, content, parentCommentId } = input;

      const comment = assertSingleNonNullish(
        await drizzle
          .insert(translatableElementComment)
          .values({
            translatableElementId: elementId,
            userId: user.id,
            content,
            parentCommentId,
          })
          .returning(),
      );

      return comment;
    }),
  getRootComments: authedProcedure
    .input(
      z.object({
        elementId: z.int(),
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
        .offset(pageIndex * pageSize)
        .limit(pageSize);

      return comments;
    }),
});
