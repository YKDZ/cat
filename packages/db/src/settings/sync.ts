import { logger } from "@cat/shared/utils";
import type { PrismaClient } from "../generated/prisma/client.ts";
import type { InputJsonValue } from "../generated/prisma/internal/prismaNamespace.ts";
import { DEFAULT_SETTINGS } from "./default.ts";

export const syncSettings = async (prisma: PrismaClient): Promise<void> => {
  const existing = (
    await prisma.setting.findMany({
      select: {
        key: true,
      },
    })
  ).map((el) => el.key);

  const existingSet = new Set(existing);

  const added = DEFAULT_SETTINGS.filter(
    (setting) => !existingSet.has(setting.key),
  );

  await prisma.setting.createMany({
    data: added.map((setting) => ({
      key: setting.key,
      value: setting.value as InputJsonValue,
    })),
  });

  if (added.length > 0) {
    logger.debug("DB", { msg: "Added settings", added });
  }
};
