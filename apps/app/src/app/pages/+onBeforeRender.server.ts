import type { PageContextServer } from "vike/types";
import { LanguageSchema } from "@cat/shared/schema/drizzle/misc";
import * as z from "zod/v4";
import { getDrizzleDB } from "@cat/db";
import { useLanguageStore } from "@/app/stores/language.ts";

export const onBeforeRender = async (ctx: PageContextServer) => {
  const languages = z
    .array(LanguageSchema)
    .parse(await (await getDrizzleDB()).client.query.language.findMany());

  useLanguageStore(ctx.pinia).languages = languages;
};
