import type { Pinia, StateTree } from "pinia";
import type { I18n, LocaleMessageValue, VueMessageType } from "vue-i18n";
import type { PrismaDB, RedisDB } from "@cat/db";
import type { User } from "@cat/shared/schema/prisma/user";
import type { HTTPHelpers } from "@cat/shared/utils";

declare global {
  namespace Vike {
    interface PageContext {
      name: string;
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
      pinia?: Pinia;
      i18nMessages?: RemoveIndexSignature<{
        [x: string]: LocaleMessageValue<VueMessageType>;
      }>;
      prismaDB: PrismaDB;
      redisDB: RedisDB;
      pluginRegistry: PluginRegistry;
    }
    interface GlobalContextClient {
      pinia?: Pinia;
      i18nMessages?: RemoveIndexSignature<{
        [x: string]: LocaleMessageValue<VueMessageType>;
      }>;
    }
  }
}

export {};
