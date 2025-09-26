import type { OverallDrizzleClient } from "@/drizzle/db.ts";

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
  return data ? (data.value as T) : fallback;
};
