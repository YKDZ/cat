import type { DrizzleDB, RedisConnection } from "@cat/db";
import type { AuthContext } from "@cat/permissions";
import type { PluginManager } from "@cat/plugin-core";
import type { User } from "@cat/shared/schema/drizzle/user";
import type { HTTPHelpers } from "@cat/shared/utils";

declare module "telefunc" {
  namespace Telefunc {
    interface Context {
      user: User | null;
      sessionId: string | null;
      auth: AuthContext | null;
      pluginManager: PluginManager;
      drizzleDB: DrizzleDB;
      redis: RedisConnection;
      helpers: HTTPHelpers;
    }
  }
}

export {};
