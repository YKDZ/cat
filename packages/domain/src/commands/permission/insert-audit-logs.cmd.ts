import { authAuditLog } from "@cat/db";
import {
  ObjectTypeSchema,
  PermissionActionSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared/schema/permission";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const AuditLogEntrySchema = z.object({
  subjectType: SubjectTypeSchema,
  subjectId: z.string(),
  action: PermissionActionSchema,
  relation: RelationSchema,
  objectType: ObjectTypeSchema,
  objectId: z.string(),
  result: z.boolean(),
  traceId: z.string().optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export const InsertAuditLogsCommandSchema = z.object({
  entries: z.array(AuditLogEntrySchema),
});

export type InsertAuditLogsCommand = z.infer<
  typeof InsertAuditLogsCommandSchema
>;

/** 批量插入鉴权审计日志。写入失败时静默忽略，不影响业务流程。 */
export const insertAuditLogs: Command<InsertAuditLogsCommand> = async (
  ctx,
  command,
) => {
  if (command.entries.length === 0) return { result: undefined, events: [] };

  await ctx.db.insert(authAuditLog).values(command.entries);

  return { result: undefined, events: [] };
};
