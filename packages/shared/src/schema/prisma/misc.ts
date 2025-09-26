import * as z from "zod/v4";
import { PrismaDateTime } from "@/schema/misc.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const LanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const TaskSchema = z.object({
  id: z.uuidv7(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  status: z
    .string()
    .refine((v) =>
      z.enum(["pending", "processing", "completed", "failed"]).parse(v),
    ),
  meta: safeZDotJson,
  type: z.string(),
});

export const SettingSchema = z.object({
  id: z.int(),
  key: z.string(),
  value: safeZDotJson,
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
});

export type Language = z.infer<typeof LanguageSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Setting = z.infer<typeof SettingSchema>;

export { PrismaDateTime };
