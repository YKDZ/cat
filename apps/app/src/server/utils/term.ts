import type { OverallDrizzleClient } from "@cat/db";
import type { PluginRegistry } from "@cat/plugin-core";

export const initTermService = async (
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
) => {
  const services = await pluginRegistry.getPluginServices(
    drizzle,
    "TERM_SERVICE",
  );
  const languageIds = (
    await drizzle.query.language.findMany({
      columns: { id: true },
    })
  ).map((l) => l.id);

  for (const { service } of services) {
    for (const langId of languageIds) {
      await service.termIndexer.ensureIndex(langId.toLowerCase());
    }
  }
};
