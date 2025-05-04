import { publicProcedure, router } from "../server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { LanguageSchema } from "@cat/shared";
import { prisma } from "@cat/db";

export const languageRouter = router({
  query: publicProcedure.query(async () => {
    return await z
      .array(LanguageSchema)
      .parseAsync(await prisma.language.findMany())
      .catch((e) => {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: e });
      });
  }),
});
