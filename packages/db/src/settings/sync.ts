import { logger } from "@cat/shared";
import type { PrismaClient } from "../generated/prisma/client";
import type { InputJsonValue } from "../generated/prisma/internal/prismaNamespace";
import { DEFAULT_SETTINGS } from "./default";

export const syncSettings = async (prisma: PrismaClient) => {
  const existings = (
    await prisma.setting.findMany({
      select: {
        key: true,
      },
    })
  ).map((el) => el.key);

  const existingsSet = new Set(existings);

  const added = DEFAULT_SETTINGS.filter(
    (setting) => !existingsSet.has(setting.key),
  );

  await prisma.setting.createMany({
    data: added.map((setting) => ({
      key: setting.key,
      value: setting.value as InputJsonValue,
    })),
  });

  if (added.length > 0) {
    logger.debug("DB", "Added settings:", added);
  }
};
