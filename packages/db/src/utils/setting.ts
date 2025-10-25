import type { OverallDrizzleClient } from "@/drizzle/db.ts";

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
  drizzle: OverallDrizzleClient,
  settingKey: string,
  fallback: T,
): Promise<T> => {
  const data = await drizzle.query.setting.findFirst({
    where: ({ key }, { eq }) => eq(key, settingKey),
    columns: {
      value: true,
    },
  });

  if (!data) return fallback;

  const raw = data.value;
  return isSameType<T>(raw, fallback) ? raw : fallback;
};
