import type { Pinia, StateTree } from "pinia";
import type { PluginRegistry } from "@cat/plugin-core";
import type * as Vue from "vue";
import type {
  I18n,
  LocaleMessageValue,
  RemovedIndexResources,
  VueMessageType,
} from "vue-i18n";
import type { ESDB, PrismaDB, RedisDB } from "@cat/db";
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
      i18nMessages?: RemoveIndexSignature<{
        [x: string]: LocaleMessageValue<VueMessageType>;
      }>;
    }
    interface GlobalContextClient {
      pinia?: Pinia;
      i18nMessages?: RemoveIndexSignature<{
        [x: string]: LocaleMessageValue<VueMessageType>;
      }>;
    }
  }
  let vue: typeof Vue | undefined;
  type WithRequired<T, K extends keyof T> = Required<Pick<T, K>> & Omit<T, K>;
  type FirstChar =
    | "A"
    | "B"
    | "C"
    | "D"
    | "E"
    | "F"
    | "G"
    | "H"
    | "I"
    | "J"
    | "K"
    | "L"
    | "M"
    | "N"
    | "O"
    | "P"
    | "Q"
    | "R"
    | "S"
    | "T"
    | "U"
    | "V"
    | "W"
    | "X"
    | "Y"
    | "Z";

  type CapitalizedKeys<T> = {
    [K in Extract<keyof T, string>]: K extends `${FirstChar}${string}`
      ? K
      : never;
  }[Extract<keyof T, string>];
}

export {};
