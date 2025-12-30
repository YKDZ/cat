import type { DrizzleDB, RedisDB } from "@cat/db";
import type { HTTPHelpers } from "@cat/shared/utils";
import type { PluginRegistry } from "@cat/plugin-core";
import type { WorkerRegistry } from "@cat/app-workers";
import type { User } from "@cat/shared/schema/drizzle/user";

declare global {
  namespace Vike {
    interface PageContext {
      name: string;
      user: User | null;
      sessionId: string | null;
    }
    interface PageContextServer {
      helpers: HTTPHelpers;
      displayLanguage: string;
    }
    interface GlobalContextServer {
      drizzleDB: DrizzleDB;
      redisDB: RedisDB;
      pluginRegistry: PluginRegistry;
    }
  }
}

export {};
