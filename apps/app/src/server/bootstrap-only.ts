import { getDbHandle } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { serverLogger } from "@cat/server-shared";

import { bootstrapDeployment } from "./bootstrap-deployment.ts";
import { createAppPluginLoader } from "./default-plugins/catalog.ts";

export const runBootstrapOnly = async (): Promise<{
  status: "applied" | "noop";
}> => {
  const database = await getDbHandle();
  try {
    PluginManager.clear();
    const pluginManager = PluginManager.get(
      "GLOBAL",
      "",
      createAppPluginLoader(serverLogger),
      serverLogger,
    );
    return await bootstrapDeployment({ database, pluginManager });
  } finally {
    await database.disconnect();
  }
};
