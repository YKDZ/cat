import { setting } from "@/drizzle";
import type { DrizzleClient } from "@/drizzle/db.ts";
import { assertFirstOrNull } from "@cat/shared/utils";
import { eq } from "drizzle-orm";

const isSameType = <T>(value: unknown, sample: T): value is T => {
  if (Array.isArray(sample)) {
    return Array.isArray(value);
  }
  if (sample instanceof Date) {
    return value instanceof Date;
  }
  const sampleType = typeof sample;
  if (sampleType === "object") {
    return typeof value === "object" && value !== null;
  }
  return typeof value === sampleType;
};

export const getSetting = async <T>(
  drizzle: DrizzleClient,
  settingKey: string,
  fallback: T,
): Promise<T> => {
  const data = assertFirstOrNull(
    await drizzle
      .select({
        value: setting.value,
      })
      .from(setting)
      .where(eq(setting.key, settingKey))
      .limit(1),
  );

  if (!data) return fallback;

  const raw = data.value;
  return isSameType<T>(raw, fallback) ? raw : fallback;
};
