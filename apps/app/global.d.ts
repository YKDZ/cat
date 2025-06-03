import type { Pinia, StateTree } from "pinia";
import type { User, PluginComponent } from "@cat/shared";
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
      pinia?: Pinia;
      pluginRegistry: PluginRegistry;
    }
    interface GlobalContextClient {
      pinia?: Pinia;
    }
  }
}

export {};
