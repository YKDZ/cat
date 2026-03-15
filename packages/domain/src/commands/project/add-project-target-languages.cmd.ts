import { projectTargetLanguage } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const AddProjectTargetLanguagesCommandSchema = z.object({
  projectId: z.uuidv4(),
  languageIds: z.array(z.string()).min(1),
});

export type AddProjectTargetLanguagesCommand = z.infer<
  typeof AddProjectTargetLanguagesCommandSchema
>;

export const addProjectTargetLanguages: Command<
  AddProjectTargetLanguagesCommand
> = async (ctx, command) => {
  await ctx.db.insert(projectTargetLanguage).values(
    command.languageIds.map((languageId) => ({
      projectId: command.projectId,
      languageId,
    })),
  );

  return {
    result: undefined,
    events: [],
  };
};
