import * as z from "zod/v4";
import { LanguageSchema } from "@cat/shared/schema/drizzle/misc";
import { assertFirstOrNull } from "@cat/shared/utils";
import { asc, eq, ilike, language } from "@cat/db";
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

    const { page, pageSize, searchQuery } = input;

    const query = drizzle
      .select()
      .from(language)
      .orderBy(asc(language.id))
      .limit(pageSize + 1)
      .offset(page * pageSize);

    if (searchQuery.length !== 0) {
      query.where(ilike(language.id, `%${searchQuery}%`));
    }

    const languages = await query;

    const hasMore = languages.length > pageSize;

    if (hasMore) {
      languages.pop();
    }

    return {
      languages,
      hasMore,
    };
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
    const { languageId } = input;

    return assertFirstOrNull(
      await drizzle.select().from(language).where(eq(language.id, languageId)),
    );
  });
