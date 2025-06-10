import type { Pinia, StateTree } from "pinia";
import type { User, PluginComponent, HTTPHelpers } from "@cat/shared";
import type { PluginRegistry } from "@cat/plugin-core";

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
      isInited: false | undefined;
      pinia?: Pinia;
      pluginRegistry: PluginRegistry;
      helpers: HTTPHelpers;
    }
    interface GlobalContextClient {
      pinia?: Pinia;
    }
  }
}

export {};
