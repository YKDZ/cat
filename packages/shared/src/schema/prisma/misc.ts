import z from "zod";
import { PrismaDateTime } from "@/schema/misc.ts";

export const LanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const TaskSchema = z.object({
  id: z.ulid(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  status: z.enum(["pending", "processing", "completed", "failed"]),
  meta: z.json(),
  type: z.string(),
});

export const SettingSchema = z.object({
  id: z.int(),
  key: z.string(),
  value: z.json(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
});

export type Language = z.infer<typeof LanguageSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Setting = z.infer<typeof SettingSchema>;

export { PrismaDateTime };
