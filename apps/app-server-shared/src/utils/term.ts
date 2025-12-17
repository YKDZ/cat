import { language, type OverallDrizzleClient } from "@cat/db";
import type { PluginRegistry } from "@cat/plugin-core";

// TODO 重构
export const initTermService = async (
  drizzle: OverallDrizzleClient,
  pluginRegistry: PluginRegistry,
): Promise<void> => {
  const services = pluginRegistry.getPluginServices("TERM_SERVICE");
  const languageIds = (
    await drizzle
      .select({
        id: language.id,
      })
      .from(language)
  ).map((l) => l.id);

  void services;
  void languageIds;

  // await Promise.all(
  //   services.map(
  //     async ({ service }) =>
  //       await Promise.all(
  //         languageIds.map(async (langId) =>
  //           service.termIndexer.ensureIndex(langId.toLowerCase()),
  //         ),
  //       ),
  //   ),
  // );
};
