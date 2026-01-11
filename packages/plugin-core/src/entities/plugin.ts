import type { ComponentData } from "@/registry/component-registry";
import type { RegisteredService } from "@/registry/service-registry";
import type { IPluginService } from "@/services/service";
import type { JSONType } from "@cat/shared/schema/json";
import type { Hono } from "hono";

/**
 * 插件运行时上下文
 * 包含当前插件的配置、已注册的服务以及当前所处的作用域信息
 */
export type PluginContext = {
  /** 插件在当前作用域下的配置实例 */
  config: JSONType;
  /** 当前作用域 (如 'global', 'project') */
  scopeType: string;
  /** 当前作用域 ID */
  scopeId: string;
  /** 当前作用域下已注册的其他服务 */
  registeredServices: Omit<RegisteredService, "service" | "pluginId">[];
};

export type RouteContext = PluginContext & {
  /** 插件专属的路由实例 */
  app: Hono;
  /** 路由的基础路径前缀 */
  baseURL: string;
};

/**
 * 插件核心接口
 * 所有的函数都应该是纯函数或副作用可控的工厂函数
 */
export interface CatPlugin {
  /**
   * 注册服务钩子
   * 返回当前插件提供的服务实例列表
   */
  services?: (
    ctx: PluginContext,
  ) => IPluginService[] | Promise<IPluginService[]>;

  /**
   * 注册组件钩子
   * 返回当前插件提供的 UI 组件元数据
   */
  components?: (
    ctx: PluginContext,
  ) => ComponentData[] | Promise<ComponentData[]>;

  /**
   * 注册路由钩子
   * 在 Hono 实例上挂载 API
   */
  routes?: (ctx: RouteContext) => void | Promise<void>;

  /**
   * 生命周期：插件激活后调用（在 providers/components 注册完成后）
   * 用于执行初始化逻辑，如连接外部服务
   */
  onActivate?: (ctx: PluginContext) => void | Promise<void>;

  /**
   * 生命周期：插件停用/卸载前调用
   * 用于清理定时器、关闭连接等
   */
  onDeactivate?: (ctx: PluginContext) => void | Promise<void>;
}
