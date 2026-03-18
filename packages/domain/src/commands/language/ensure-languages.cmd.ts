import { language } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const EnsureLanguagesCommandSchema = z.object({
  languageIds: z.array(z.string()),
});

export type EnsureLanguagesCommand = z.infer<
  typeof EnsureLanguagesCommandSchema
>;

export const ensureLanguages: Command<EnsureLanguagesCommand> = async (
  ctx,
  command,
) => {
  if (command.languageIds.length === 0) {
    return {
      result: undefined,
      events: [],
    };
  }

  // Insert languages, ignore conflicts
  await ctx.db
    .insert(language)
    .values(command.languageIds.map((id) => ({ id })))
    .onConflictDoNothing();

  return {
    result: undefined,
    events: [],
  };
};
