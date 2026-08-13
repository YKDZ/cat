import type { DrizzleDB, RedisConnection } from "@cat/db";
import type { AuthContext } from "@cat/permissions";
import type { ComponentRecord, PluginManager } from "@cat/plugin-core";
import type { User } from "@cat/shared";
import type { HTTPHelpers } from "@cat/shared";
import type { DisplayLanguage } from "@cat/shared";
import type { Pinia, StateTree } from "pinia";
import type { Component } from "vue";
import type {
  I18n,
  LocaleMessageValue,
  RemovedIndexResources,
  VueMessageType,
  Message,
} from "vue-i18n";

declare global {
  namespace Vike {
    interface Server {
      server: "hono";
    }
    interface PageContext {
      user: User | null;
      sessionId: string | null;
      auth: AuthContext | null;
      _piniaInitState?: string;
      abortReason: string | undefined;
      displayLanguage: DisplayLanguage;
      isMobile: boolean;
    }
    interface PageContextServer {
      pinia?: Pinia;
      helpers: HTTPHelpers;
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
      redis?: RedisConnection;
      pluginManager: PluginManager;
      resolvePluginComponentPath: typeof resolvePluginComponentPath;
    }
    interface GlobalContextClient {
      i18n?: I18n;
    }
  }
}

export {};
