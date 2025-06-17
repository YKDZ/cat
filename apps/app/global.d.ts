import type { Pinia, StateTree } from "pinia";
import type { User, PluginComponent, HTTPHelpers } from "@cat/shared";
import type { PluginRegistry } from "@cat/plugin-core";
import type * as Vue from "vue";

declare global {
  namespace Vike {
    interface PageContext {
      name: string;
      user: User | null;
      sessionId: string | null;
      _piniaInitState?: StateTree;
      pluginComponents: PluginComponent[];
    }
    interface PageContextServer {
      pinia?: Pinia;
      pluginRegistry: PluginRegistry;
      helpers: HTTPHelpers;
    }
    interface GlobalContextClient {
      pinia?: Pinia;
    }
  }
  let vue: typeof Vue | undefined;
}

export {};
