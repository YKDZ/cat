import type { Pinia, StateTree } from "pinia";
import type { I18n, LocaleMessageValue, VueMessageType } from "vue-i18n";
import type { DrizzleDB, RedisDB } from "@cat/db";
import type { User } from "@cat/shared/schema/prisma/user";
import type { HTTPHelpers } from "@cat/shared/utils";
import type { RuntimeAdapter } from "vike-server/hono";

declare global {
  namespace Vike {
    interface PageContext {
      user: User | null;
      sessionId: string | null;
      _piniaInitState?: StateTree;
      i18n?: I18n;
      abortReason: string | undefined;
    }
    interface PageContextServer {
      pinia?: Pinia;
      helpers: HTTPHelpers;
      displayLanguage: string;
      runtime: RuntimeAdapter;
    }
    interface GlobalContextServer {
      name: string;
      pinia?: Pinia;
      i18nMessages?: RemoveIndexSignature<{
        [x: string]: LocaleMessageValue<VueMessageType>;
      }>;
      drizzleDB: DrizzleDB;
      redisDB: RedisDB;
      pluginRegistry: PluginRegistry;
    }
    interface GlobalContextClient {
      name: string;
      pinia?: Pinia;
      i18nMessages?: RemoveIndexSignature<{
        [x: string]: LocaleMessageValue<VueMessageType>;
      }>;
    }
  }
}

export {};
