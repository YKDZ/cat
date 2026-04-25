import { executeQuery, getLanguage, listLanguages } from "@cat/domain";
import { LanguageSchema } from "@cat/shared";
import * as z from "zod";

import { base } from "@/orpc/server";

export const getAll = base
  .input(
    z.object({
      page: z.int().min(0).default(0),
      pageSize: z.int().min(1).max(200).default(100),
      searchQuery: z.string().default(""),
    }),
  )
  .output(
    z.object({
      languages: z.array(LanguageSchema),
      hasMore: z.boolean(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listLanguages, input);
  });

export const get = base
  .input(
    z.object({
      languageId: z.string(),
    }),
  )
  .output(LanguageSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, getLanguage, input);
  });
