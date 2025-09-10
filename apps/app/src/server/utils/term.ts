import type { PrismaClient } from "@cat/db";
import type { PluginRegistry } from "@cat/plugin-core";

export const initTermService = async (
  prisma: PrismaClient,
  pluginRegistry: PluginRegistry,
) => {
  const services = await pluginRegistry.getTermServices(prisma);
  const languageIds = (
    await prisma.language.findMany({
      select: { id: true },
    })
  ).map((l) => l.id);

  for (const { service } of services) {
    for (const langId of languageIds) {
      await service.termIndexer.ensureIndex(langId.toLowerCase());
    }
  }
};
