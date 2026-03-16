import type { DrizzleDB, RedisConnection } from "@cat/db";
import type { ComponentRecord, PluginManager } from "@cat/plugin-core";
import type { User } from "@cat/shared/schema/drizzle/user";
import type { HTTPHelpers } from "@cat/shared/utils";
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
    interface PageContextServer {
      isMobile: boolean;
    }
  }
}

export {};
