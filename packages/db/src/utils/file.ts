import { eq } from "drizzle-orm";
import { extname } from "node:path";

import type { DrizzleClient } from "@/drizzle/db.ts";

import { setting } from "@/drizzle";

const isStringRecord = (value: unknown): value is Record<string, string> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "string");
};

export const sanitizeFileName = (name: string): string => {
  return name.replace(/[^\w.-]/g, "_");
};

export const mimeFromFileName = async (
  drizzle: DrizzleClient,
  fileName: string,
): Promise<string> => {
  const row = await drizzle
    .select({ value: setting.value })
    .from(setting)
    .where(eq(setting.key, "file-system.mime-mapping"))
    .limit(1);

  const raw = row[0]?.value;
  const mimeMapping = isStringRecord(raw) ? raw : { ext: "mime" };

  return mimeMapping[extname(fileName)] || "application/octet-stream";
};
