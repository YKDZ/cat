import type { DbHandle, DrizzleClient } from "@cat/domain";

import { executeCommand, registerPluginDefinition } from "@cat/domain";

import { FileSystemPluginLoader, type PluginLoader } from "./loader";

/**
 * 插件发现服务
 * 负责维护文件系统到数据库 plugin 表的同步
 * 这是一个全局单例服务，不涉及具体的作用域安装
 */
export class PluginDiscoveryService {
  private static instance: PluginDiscoveryService;
  private loader: PluginLoader;

  private constructor(loader: PluginLoader = new FileSystemPluginLoader()) {
    this.loader = loader;
  }

  public static getInstance(loader?: PluginLoader): PluginDiscoveryService {
    if (!PluginDiscoveryService.instance) {
      PluginDiscoveryService.instance = new PluginDiscoveryService(loader);
    }
    return PluginDiscoveryService.instance;
  }

  public getLoader = (): PluginLoader => this.loader;

  /**
   * 插入 loader 包含的所有插件的定义到数据库
   */
  public async syncDefinitions(drizzle: DrizzleClient): Promise<void> {
    await drizzle.transaction(async (tx) => {
      const availableIds = await this.loader.listAvailablePlugins();

      // 单个事务连接上不能并发注册多个插件定义，否则 pg 会出现并发 query。
      for (const { id } of availableIds) {
        // oxlint-disable-next-line no-await-in-loop
        await this.registerDefinition(tx, id);
      }
    });
  }

  /**
   * 注册单个插件定义到数据库
   */
  public async registerDefinition(
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<void> {
    const data = await this.loader.getData(pluginId);

    await executeCommand({ db: drizzle }, registerPluginDefinition, {
      pluginId,
      version: data.version,
      name: data.name,
      entry: data.entry ?? null,
      overview: data.overview ?? "",
      iconUrl: data.iconURL ?? null,
      configSchema: data.config,
    });
  }
}
