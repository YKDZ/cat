import type { PluginCapabilities, PluginServiceRecord } from "@cat/domain";
import type { CacheStore, SessionStore } from "@cat/domain";
import type { ScopeType } from "@cat/shared";
import type { JSONType } from "@cat/shared";
import type { ObjectType, Relation } from "@cat/shared";
import type { Hono } from "hono";

import type { ComponentData } from "#/registry/component-registry.ts";
import type { IPluginService } from "#/services/service.ts";

export type DiagnosticContext = Readonly<Record<string, unknown>>;
export type DiagnosticFields = Readonly<Record<string, unknown>>;

/** Structured diagnostics exposed to plugin-facing composition boundaries. */
export type PluginLogger = {
  child: (context: DiagnosticContext) => PluginLogger;
  debug: (message: string, fields?: DiagnosticFields) => void;
  info: (message: string, fields?: DiagnosticFields) => void;
  warn: (message: string, fields?: DiagnosticFields) => void;
  error: (message: string, fields?: DiagnosticFields) => void;
  fatal: (message: string, fields?: DiagnosticFields) => void;
};

/**
 * 插件鉴权上下文
 * 用于在 capability 层做权限拦截
 */
export type PluginAuthContext = {
  pluginId: string;
  scopeType: ScopeType;
  scopeId: string;
  checkPermission: (
    objectType: ObjectType,
    relation: Relation,
    objectId: string,
  ) => Promise<boolean>;
};

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
  registeredServices: PluginServiceRecord[];
  /** 插件能力边界：通过 capability 访问基础能力，不直接触达底层 command/query */
  capabilities: PluginCapabilities;
  /** Host-owned diagnostics logger shared with application observers. */
  logger: PluginLogger;
  /** 缓存存储（K-V 语义） */
  cacheStore: CacheStore;
  /** 会话存储（Hash 语义，支持 TTL） */
  sessionStore: SessionStore;
  /** 插件鉴权上下文 */
  auth: PluginAuthContext;
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
   * Reload may activate a candidate context before deactivating the current
   * context, so resources must be owned by the supplied context identity.
   */
  onActivate?: (ctx: PluginContext) => void | Promise<void>;

  /**
   * 生命周期：插件停用/卸载前调用
   * 用于清理定时器、关闭连接等
   * Cleanup must only release resources owned by the supplied context.
   */
  onDeactivate?: (ctx: PluginContext) => void | Promise<void>;
}
