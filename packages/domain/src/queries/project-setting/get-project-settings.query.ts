import { eq, projectSetting } from "@cat/db";
import { ProjectSettingPayloadSchema } from "@cat/shared/schema/project-setting";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetProjectSettingsQuerySchema = z.object({
  projectId: z.uuid(),
});

export type GetProjectSettingsQuery = z.infer<
  typeof GetProjectSettingsQuerySchema
>;

export const getProjectSettings: Query<
  GetProjectSettingsQuery,
  z.infer<typeof ProjectSettingPayloadSchema>
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(projectSetting)
    .where(eq(projectSetting.projectId, query.projectId))
    .limit(1);

  const raw = rows[0]?.settings ?? {};
  return ProjectSettingPayloadSchema.parse(raw);
};
