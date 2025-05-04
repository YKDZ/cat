import { UserSchema } from "@cat/shared";
import { authedProcedure, router } from "../server";
import { z } from "zod";
import { prisma } from "@cat/db";
import { TRPCError } from "@trpc/server";

export const userRouter = router({
  update: authedProcedure
    .input(
      z.object({
        user: UserSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user: newUser } = input;
      const { user } = ctx;

      if (user.id !== newUser.id)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "你没有更新他人的信息的权限",
        });

      return UserSchema.parse(
        await prisma.user.update({
          where: {
            id: newUser.id,
          },
          data: {
            email: user.email,
          },
        }),
      );
    }),
  init: authedProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string(),
        readableLanguageIds: z.array(z.string()),
        writableLanguageIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {}),
});
