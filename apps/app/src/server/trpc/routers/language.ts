import { publicProcedure, router } from "../server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import { LanguageSchema } from "@cat/shared";
import { prisma } from "@cat/db";

export const languageRouter = router({
  listAll: publicProcedure.output(z.array(LanguageSchema)).query(async () => {
    return await z
      .array(LanguageSchema)
      .parseAsync(await prisma.language.findMany())
      .catch((e) => {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: e });
      });
  }),
  query: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(LanguageSchema.nullable())
    .query(async ({ input }) => {
      const { id } = input;

      return LanguageSchema.nullable().parse(
        await prisma.language.findUnique({
          where: {
            id,
          },
        }),
      );
    }),
});
