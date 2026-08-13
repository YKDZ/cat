import { projectTargetLanguage } from "@cat/db";
import { NormalizedLanguageIdSchema } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const AddProjectTargetLanguagesCommandSchema = z.strictObject({
  projectId: z.uuidv4(),
  languageIds: z.array(NormalizedLanguageIdSchema).min(1),
});

export type AddProjectTargetLanguagesCommand = z.input<
  typeof AddProjectTargetLanguagesCommandSchema
>;

export const addProjectTargetLanguages: Command<
  AddProjectTargetLanguagesCommand
> = async (ctx, command) => {
  const input = AddProjectTargetLanguagesCommandSchema.parse(command);
  await ctx.db.insert(projectTargetLanguage).values(
    input.languageIds.map((languageId) => ({
      projectId: input.projectId,
      languageId,
    })),
  );

  return {
    result: undefined,
    events: [],
  };
};
