import type { OverallDrizzleClient } from "@cat/db";
import type { PluginRegistry } from "@cat/plugin-core";

export const initTermService = async (
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
): Promise<void> => {
  const services = await pluginRegistry.getPluginServices(
    drizzle,
    "TERM_SERVICE",
  );
  const languageIds = (
    await drizzle.query.language.findMany({
      columns: { id: true },
    })
  ).map((l) => l.id);

  await Promise.all(
    services.map(
      async ({ service }) =>
        await Promise.all(
          languageIds.map(async (langId) =>
            service.termIndexer.ensureIndex(langId.toLowerCase()),
          ),
        ),
    ),
  );
};
