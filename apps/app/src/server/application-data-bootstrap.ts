import { registerBuiltinAgents } from "@cat/agent";
import { ensureDB, ensureRootUser, type DrizzleDB } from "@cat/db";
import {
  ensureCoreRelationTypes,
  executeCommand,
  executeQuery,
  getFirstRegisteredUser,
} from "@cat/domain";
import { grantFirstUserSuperadmin, seedSystemRoles } from "@cat/permissions";
import { PluginManager } from "@cat/plugin-core";

import { getDefaultPluginIds } from "./default-plugins/catalog.ts";

export type ApplicationDataBootstrapOptions = {
  database: DrizzleDB;
  pluginManager: PluginManager;
};

export const syncApplicationPluginDefinitions = async ({
  database,
  pluginManager,
}: ApplicationDataBootstrapOptions): Promise<void> => {
  await pluginManager.getDiscovery().syncDefinitions(database.client);
};

/**
 * Populate business records required by CAT before the runtime accepts traffic.
 * Schema preparation is deliberately external to this operation.
 */
export const bootstrapApplicationData = async ({
  database,
  pluginManager,
}: ApplicationDataBootstrapOptions): Promise<void> => {
  await ensureDB(database);

  await syncApplicationPluginDefinitions({ database, pluginManager });
  await PluginManager.installDefaults(
    database.client,
    pluginManager,
    getDefaultPluginIds(),
  );
  await pluginManager.restore(database.client);

  await database.client.transaction(async (tx) => {
    await ensureRootUser(tx);
  });

  await seedSystemRoles(database.client);
  await executeCommand({ db: database.client }, ensureCoreRelationTypes, {});
  await registerBuiltinAgents(database.client);

  const firstUser = await executeQuery(
    { db: database.client },
    getFirstRegisteredUser,
    {},
  );
  if (firstUser !== null) {
    await grantFirstUserSuperadmin(database.client, firstUser.id);
  }
};
