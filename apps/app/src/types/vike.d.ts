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
import type { ComponentRecord, PluginRegistry } from "@cat/plugin-core";
import type { Component } from "vue";

declare global {
  namespace Vike {
    interface PageContext {
      user: User | null;
      sessionId: string | null;
      _piniaInitState?: StateTree;
      abortReason: string | undefined;
    }
    interface PageContextServer {
      pinia?: Pinia;
      helpers: HTTPHelpers;
      displayLanguage: string;
      isMobile: boolean;
      i18n?: I18n;
    }
    interface GlobalContext {
      pinia?: Pinia;
      name: string;
      baseURL: string;
      i18nMessages?: Record<string, Message>;
    }
    interface GlobalContextServer {
      drizzleDB: DrizzleDB;
      redisDB: RedisDB;
      pluginRegistry: PluginRegistry;
      resolvePluginComponentPath: typeof resolvePluginComponentPath;
    }
    interface GlobalContextClient {
      i18n?: I18n;
    }
  }
}

export {};
