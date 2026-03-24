import {
  executeCommand,
  executeQuery,
  getSetting,
  setSetting,
} from "@cat/domain";
import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod/v4";

import { authed, checkPermission } from "@/orpc/server";

export const set = authed
  .input(
    z.object({
      key: z.string(),
      value: nonNullSafeZDotJson,
    }),
  )
  .use(checkPermission("system", "admin"), () => "*")
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    await executeCommand({ db: drizzle }, setSetting, input);
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

    return await executeQuery({ db: drizzle }, getSetting, input);
  });
