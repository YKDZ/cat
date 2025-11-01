import * as z from "zod/v4";
import { LanguageSchema } from "@cat/shared/schema/drizzle/misc";
import { publicProcedure, router } from "@/trpc/server.ts";

export const languageRouter = router({
  getAll: publicProcedure
    .output(z.array(LanguageSchema))
    .query(async ({ ctx }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;

      return await drizzle.query.language.findMany();
    }),
  get: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(LanguageSchema.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { id } = input;

      return (
        (await drizzle.query.language.findFirst({
          where: (language, { eq }) => eq(language.id, id),
        })) ?? null
      );
    }),
});
