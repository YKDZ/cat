import * as z from "zod/v4";
import { LanguageSchema } from "@cat/shared/schema/drizzle/misc";
import { authedProcedure, publicProcedure, router } from "@/trpc/server.ts";

export const languageRouter = router({
  listAll: publicProcedure
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
  getProjectTargetLanguages: authedProcedure
    .input(
      z.object({
        projectId: z.string(),
      }),
    )
    .output(z.array(LanguageSchema))
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { projectId } = input;

      return await drizzle.transaction(async (tx) => {
        const ids = await tx.query.projectTargetLanguage.findMany({
          where: (language, { eq }) => eq(language.projectId, projectId),
          columns: { languageId: true },
        });

        return await tx.query.language.findMany({
          where: (language, { inArray }) =>
            inArray(
              language.id,
              ids.map((i) => i.languageId),
            ),
        });
      });
    }),
});
