import { eq, projectSetting } from "@cat/db";
import {
  ProjectSettingPatchSchema,
  ProjectSettingPayloadSchema,
  type ProjectSettingPayload,
} from "@cat/shared/schema/project-setting";
import * as z from "zod";

import type { Command } from "@/types";

export const UpdateProjectSettingsCommandSchema = z.object({
  projectId: z.uuid(),
  patch: ProjectSettingPatchSchema,
});

export type UpdateProjectSettingsCommand = z.infer<
  typeof UpdateProjectSettingsCommandSchema
>;

export const updateProjectSettings: Command<
  UpdateProjectSettingsCommand,
  ProjectSettingPayload
> = async (ctx, command) => {
  const existing = await ctx.db
    .select()
    .from(projectSetting)
    .where(eq(projectSetting.projectId, command.projectId))
    .limit(1);

  const currentRaw = existing[0]?.settings ?? {};
  const current = ProjectSettingPayloadSchema.parse(currentRaw);
  const definedPatch = Object.fromEntries(
    Object.entries(command.patch).filter(([, v]) => v !== undefined),
  );
  const merged = { ...current, ...definedPatch };

  if (existing[0]) {
    await ctx.db
      .update(projectSetting)
      .set({ settings: merged, updatedAt: new Date() })
      .where(eq(projectSetting.projectId, command.projectId));
  } else {
    await ctx.db.insert(projectSetting).values({
      projectId: command.projectId,
      settings: merged,
    });
  }

  return { result: merged, events: [] };
};
