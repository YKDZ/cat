import * as z from "zod/v4";
import { safeZDotJson } from "@cat/shared/schema/json";
import { eq, setting as settingTable } from "@cat/db";
import { authedProcedure, router } from "@/trpc/server.ts";

export const settingRouter = router({
  set: authedProcedure
    .input(
      z.array(
        z.object({
          key: z.string(),
          value: z.json(),
        }),
      ),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const arr = input;

      await drizzle.transaction(async (tx) => {
        for (const item of arr) {
          const { key, value } = item;
          await tx
            .update(settingTable)
            .set({ value })
            .where(eq(settingTable.key, key));
        }
      });
    }),
  get: authedProcedure
    .input(
      z.object({
        key: z.string(),
      }),
    )
    .output(safeZDotJson.nullable())
    .query(async ({ ctx, input }) => {
      const {
        drizzleDB: { client: drizzle },
      } = ctx;
      const { key } = input;

      const setting = await drizzle.query.setting.findFirst({
        where: (setting, { eq }) => eq(setting.key, key),
        columns: {
          value: true,
        },
      });

      if (!setting) return null;

      return setting.value;
    }),
});
