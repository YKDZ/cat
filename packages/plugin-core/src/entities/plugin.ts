import type { ComponentData } from "@/registry/component-registry";
import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import type { JSONType } from "@cat/shared/schema/json";
import { Hono } from "hono";

export type RegisteredService = {
  type: PluginServiceType;
  id: string;
  dbId: number;
};

export type ServicesContext = {
  config?: JSONType;
  services: RegisteredService[];
};

export type ComponentsContext = {
  config?: JSONType;
  services: RegisteredService[];
};

export type RoutesContext = {
  config?: JSONType;
  services: RegisteredService[];
  baseURL: string;
  route: Hono;
};

export interface CatPlugin {
  services?: (
    ctx: ServicesContext,
  ) => IPluginService[] | Promise<IPluginService[]>;
  components?: (
    ctx: ComponentsContext,
  ) => ComponentData[] | Promise<ComponentData[]>;
  routes?: (ctx: RoutesContext) => void | Promise<void>;
}
