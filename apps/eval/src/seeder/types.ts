import type { DrizzleDB, RedisConnection } from "@cat/db";
import type { PluginManager } from "@cat/plugin-core";

import type { RefResolver } from "./ref-resolver";

export type SeededContext = {
  db: DrizzleDB;
  redis: RedisConnection;
  pluginManager: PluginManager;
  refs: RefResolver;
  projectId: string;
  glossaryId: string | undefined;
  memoryId: string | undefined;
  documentId: string | undefined;
  userId: string;
  cleanup: () => Promise<void>;
};
