import type { Hono } from "hono";

/**
 * 路由注册表：pluginId → Hono 子应用
 * 用于中间件代理模式，支持运行时动态注册/注销插件路由
 */
export class PluginRouteRegistry {
  private routes = new Map<string, Hono>();

  public register(pluginId: string, app: Hono): void {
    this.routes.set(pluginId, app);
  }

  public remove(pluginId: string): void {
    this.routes.delete(pluginId);
  }

  public resolve(pluginId: string): Hono | undefined {
    return this.routes.get(pluginId);
  }
}
