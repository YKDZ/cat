import { eq, task } from "@cat/db";
import * as z from "zod";

import {
  LocalizationTaskMetaSchema,
  type LocalizationTaskSummary,
} from "#/commands/localization-task/index.ts";
import type { Query } from "#/types.ts";

export const GetLocalizationTaskQuerySchema = z.object({
  taskId: z.uuidv4(),
});

export type GetLocalizationTaskQuery = z.infer<
  typeof GetLocalizationTaskQuerySchema
>;

export const getLocalizationTask: Query<
  GetLocalizationTaskQuery,
  LocalizationTaskSummary | null
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select({
      id: task.id,
      status: task.status,
      meta: task.meta,
    })
    .from(task)
    .where(eq(task.id, query.taskId));

  if (row === undefined) return null;

  return {
    id: row.id,
    status: row.status,
    ...LocalizationTaskMetaSchema.parse(row.meta),
  };
};
