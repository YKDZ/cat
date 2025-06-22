import z from "zod/v4";
import { PrimsaDateTime } from "../misc";

export const LanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const PermissionSchema = z.object({
  permission: z.string(),
  projectId: z.cuid2(),
  userId: z.cuid2(),
});

export const TaskSchema = z.object({
  id: z.cuid2(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  status: z.enum(["pending", "processing", "completed", "failed"]),
  meta: z.json(),
  type: z.string(),
});

export const SettingSchema = z.object({
  id: z.int(),
  key: z.string(),
  value: z.json(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
});

export type Language = z.infer<typeof LanguageSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Setting = z.infer<typeof SettingSchema>;
