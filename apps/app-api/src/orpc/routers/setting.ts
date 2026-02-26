import { eq, setting as settingTable } from "@cat/db";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

export const set = authed
  .input(
    z.object({
      key: z.string(),
      value: nonNullSafeZDotJson,
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { key, value } = input;

    await drizzle
      .update(settingTable)
      .set({ value })
      .where(eq(settingTable.key, key));
  });

export const get = authed
  .input(
    z.object({
      key: z.string(),
    }),
  )
  .output(safeZDotJson.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { key } = input;

    const setting = assertSingleOrNull(
      await drizzle
        .select({
          value: settingTable.value,
        })
        .from(settingTable)
        .where(eq(settingTable.key, key)),
    );

    if (!setting) return null;

    return setting.value;
  });
