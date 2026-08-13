import { registerBuiltinAgents } from "@cat/agent";
import { ensureDB, ensureRootUser, type DrizzleDB } from "@cat/db";
import {
  ensureCoreRelationTypes,
  executeCommand,
  executeQuery,
  getFirstRegisteredUser,
  getLanguageAnalysisSelection,
  LanguageAnalysisSelectionConflictError,
  writeValidatedLanguageAnalysisSelection,
} from "@cat/domain";
import { validateLanguageAnalyzerConfiguration } from "@cat/operations";
import { grantFirstUserSuperadmin, seedSystemRoles } from "@cat/permissions";
import { PluginManager } from "@cat/plugin-core";
import { LanguageAnalysisWildcardSelectionKey } from "@cat/shared";

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

const ensureDefaultLanguageAnalysisSelection = async (
  database: DrizzleDB,
  pluginManager: PluginManager,
): Promise<void> => {
  const existing = await executeQuery(
    { db: database.client },
    getLanguageAnalysisSelection,
    { key: LanguageAnalysisWildcardSelectionKey },
  );
  if (existing !== null) return;

  const service = pluginManager
    .getServices("LANGUAGE_ANALYZER")
    .find(
      ({ id, pluginId }) =>
        id === "spacy-language-analyzer" &&
        pluginId === "spacy-language-analyzer",
    );
  if (service === undefined) return;

  const implementation =
    pluginManager.createServiceImplementationReference(service);
  const configuration = await validateLanguageAnalyzerConfiguration(
    implementation,
    { pluginManager, traceId: "bootstrap-language-analysis-selection" },
  );
  try {
    await executeCommand(
      { db: database.client },
      writeValidatedLanguageAnalysisSelection,
      {
        key: LanguageAnalysisWildcardSelectionKey,
        expectedRevision: 0,
        implementation,
        configurationFingerprint: configuration.fingerprint,
      },
    );
  } catch (error) {
    if (!(error instanceof LanguageAnalysisSelectionConflictError)) throw error;
  }
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
  await ensureDefaultLanguageAnalysisSelection(database, pluginManager);

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
