import type { PrismaDB, RedisDB } from "@cat/db";
import type { User } from "@cat/shared/schema/prisma/user";
import type { HTTPHelpers } from "@cat/shared/utils";
import type { PluginRegistry } from "@cat/plugin-core";

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
      prismaDB: PrismaDB;
      redisDB: RedisDB;
      pluginRegistry: PluginRegistry;
    }
  }
}

export {};
