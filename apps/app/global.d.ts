import type { Pinia, StateTree } from "pinia";
import type { User, HTTPHelpers } from "@cat/shared";
import type { PluginRegistry } from "@cat/plugin-core";
import type * as Vue from "vue";
import type {
  I18n,
  LocaleMessageValue,
  RemovedIndexResources,
  VueMessageType,
} from "vue-i18n";
import type { ESDB, PrismaDB, RedisDB } from "@cat/db";

declare global {
  namespace Vike {
    interface PageContext {
      name: string;
      user: User | null;
      sessionId: string | null;
      _piniaInitState?: StateTree;
      i18n?: I18n;
      i18nMessages?: RemovedIndexResources<{
        [x: string]: LocaleMessageValue<VueMessageType>;
      }>;
    }
    interface PageContextServer {
      pinia?: Pinia;
      pluginRegistry: PluginRegistry;
      prismaDB: PrismaDB;
      redisDB: RedisDB;
      esDB: ESDB;
      helpers: HTTPHelpers;
      displayLanguage: string;
    }
    interface GlobalContextServer {
      pinia?: Pinia;
      i18nMessages?: RemovedIndexResources<{
        [x: string]: LocaleMessageValue<VueMessageType>;
      }>;
    }
    interface GlobalContextClient {
      pinia?: Pinia;
    }
  }
  let vue: typeof Vue | undefined;
}

export {};
