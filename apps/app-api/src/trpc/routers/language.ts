import * as z from "zod/v4";
import { LanguageSchema } from "@cat/shared/schema/prisma/misc";
import { publicProcedure, router } from "@/trpc/server.ts";

export const languageRouter = router({
  listAll: publicProcedure
    .output(z.array(LanguageSchema))
    .query(async ({ ctx }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;

      return await prisma.language.findMany();
    }),
  query: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(LanguageSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
      } = ctx;
      const { id } = input;

      return await prisma.language.findUnique({
        where: {
          id,
        },
      });
    }),
});
