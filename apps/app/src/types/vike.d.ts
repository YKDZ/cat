import type { Pinia, StateTree } from "pinia";
import type {
  I18n,
  LocaleMessageValue,
  RemovedIndexResources,
  VueMessageType,
  Message,
} from "vue-i18n";
import type { DrizzleDB, RedisDB } from "@cat/db";
import type { User } from "@cat/shared/schema/drizzle/user";
import type { HTTPHelpers } from "@cat/shared/utils";

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
    }
    interface GlobalContextServer {
      name: string;
      pinia?: Pinia;
      i18nMessages?: Record<string, Message>;
      drizzleDB: DrizzleDB;
      redisDB: RedisDB;
      pluginRegistry: PluginRegistry;
    }
    interface GlobalContextClient {
      name: string;
      pinia?: Pinia;
      i18nMessages?: Record<string, Message>;
    }
  }
}

export {};
