import type { JSONType } from "@cat/shared/schema/json";

import { eq, setting } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetSettingQuerySchema = z.object({
  key: z.string(),
});

export type GetSettingQuery = z.infer<typeof GetSettingQuerySchema>;

export const getSetting: Query<GetSettingQuery, JSONType | null> = async (
  ctx,
  query,
) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ value: setting.value })
      .from(setting)
      .where(eq(setting.key, query.key)),
  );

  return row?.value ?? null;
};
