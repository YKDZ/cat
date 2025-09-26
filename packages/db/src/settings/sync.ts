import { DEFAULT_SETTINGS } from "./default.ts";
import type { OverallDrizzleClient } from "@/drizzle/db.ts";
import { setting } from "@/drizzle/schema/misc.ts";

export const syncSettings = async (
  drizzle: OverallDrizzleClient,
): Promise<void> => {
  if (DEFAULT_SETTINGS.length === 0) return;

  await drizzle
    .insert(setting)
    .values(
      DEFAULT_SETTINGS.map((setting) => ({
        key: setting.key,
        value: setting.value,
      })),
    )
    .onConflictDoNothing();
};
