import { and, desc, eq, inArray, lt, or, task } from "@cat/db";
import { TaskKindNameSchema, TaskStatusSchema } from "@cat/shared";
import * as z from "zod";

import {
  taskFields,
  toSummary,
  type LocalizationTaskSummary,
} from "#/commands/localization-task/upsert-localization-task.cmd.ts";
import type { Query } from "#/types.ts";

import {
  TaskReadAuthorizationSchema,
  type TaskReadAuthorization,
} from "./get-localization-task.query.ts";

export const ListLocalizationTasksQuerySchema = z.strictObject({
  authorization: TaskReadAuthorizationSchema,
  projectId: z.uuidv4().optional(),
  status: TaskStatusSchema.optional(),
  kind: TaskKindNameSchema.optional(),
  pageSize: z.int().min(1).max(100).default(20),
  cursor: z
    .strictObject({ updatedAt: z.iso.datetime(), id: z.uuidv4() })
    .optional(),
});

export type ListLocalizationTasksQuery = z.infer<
  typeof ListLocalizationTasksQuerySchema
>;

export type LocalizationTaskPage = {
  items: LocalizationTaskSummary[];
  hasMore: boolean;
  nextCursor: { updatedAt: string; id: string } | null;
};

const authorizationCondition = (authorization: TaskReadAuthorization) => {
  if (authorization.systemAdmin) return undefined;

  const conditions = [
    and(eq(task.scopeType, "USER"), eq(task.scopeId, authorization.viewerId)),
  ];
  if (authorization.authorizedProjectIds.length > 0) {
    conditions.push(
      and(
        eq(task.scopeType, "PROJECT"),
        inArray(task.scopeId, authorization.authorizedProjectIds),
      ),
    );
  }
  return or(...conditions);
};

export const listLocalizationTasks: Query<
  ListLocalizationTasksQuery,
  LocalizationTaskPage
> = async (ctx, query) => {
  const filters = [authorizationCondition(query.authorization)];
  if (query.projectId !== undefined) {
    filters.push(
      and(eq(task.scopeType, "PROJECT"), eq(task.scopeId, query.projectId)),
    );
  }
  if (query.status !== undefined) filters.push(eq(task.status, query.status));
  if (query.kind !== undefined) filters.push(eq(task.kind, query.kind));
  if (query.cursor !== undefined) {
    const updatedAt = new Date(query.cursor.updatedAt);
    filters.push(
      or(
        lt(task.updatedAt, updatedAt),
        and(eq(task.updatedAt, updatedAt), lt(task.id, query.cursor.id)),
      ),
    );
  }

  const rows = await ctx.db
    .select(taskFields)
    .from(task)
    .where(and(...filters))
    .orderBy(desc(task.updatedAt), desc(task.id))
    .limit(query.pageSize + 1);

  const items = rows.slice(0, query.pageSize).map(toSummary);
  const last = items.at(-1);

  return {
    items,
    hasMore: rows.length > query.pageSize,
    nextCursor:
      rows.length > query.pageSize && last
        ? { updatedAt: last.updatedAt.toISOString(), id: last.id }
        : null,
  };
};
