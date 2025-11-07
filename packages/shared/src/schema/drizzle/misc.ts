import * as z from "zod/v4";
import { nonNullSafeZDotJson, safeZDotJson } from "@/schema/json.ts";
import { DrizzleDateTimeSchema } from "../misc";

export const LanguageSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const TaskSchema = z.object({
  id: z.uuidv7(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
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
  value: nonNullSafeZDotJson,
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export type Language = z.infer<typeof LanguageSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Setting = z.infer<typeof SettingSchema>;
