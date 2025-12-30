import type { DrizzleDB, RedisDB } from "@cat/db";
import type { PluginRegistry } from "@cat/plugin-core";
import type { User } from "@cat/shared/schema/drizzle/user";
import type { HTTPHelpers } from "@cat/shared/utils";

declare module "telefunc" {
  namespace Telefunc {
    interface Context {
      user: User | null;
      sessionId: string | null;
      pluginRegistry: PluginRegistry;
      drizzleDB: DrizzleDB;
      redisDB: RedisDB;
      helpers: HTTPHelpers;
    }
  }
}

export {};
