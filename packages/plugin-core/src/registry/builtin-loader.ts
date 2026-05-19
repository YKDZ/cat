import type { PluginData, PluginManifest } from "@cat/shared";

import { resolve, sep } from "node:path";

import type { CatPlugin } from "@/entities/plugin";

import type { PluginLoader } from "./loader";

/**
 * @zh 内置插件目录中的单个插件条目。
 * @en Single plugin entry inside the builtin plugin catalog.
 */
export type BuiltinPluginEntry = {
  /** @zh 插件 manifest。 @en Plugin manifest. */
  manifest: PluginManifest;
  /** @zh 插件展示数据。 @en Plugin display data. */
  data: PluginData;
  /** @zh 返回插件实例的加载函数。 @en Loader function returning the plugin instance. */
  load: () => Promise<CatPlugin> | CatPlugin;
  /** @zh 可选静态资源根目录。 @en Optional root directory for static assets. */
  assetRoot?: string;
};

/**
 * @zh 基于静态 catalog 的内置插件 loader。
 * @en Builtin plugin loader backed by a static catalog.
 */
export class BuiltinPluginLoader implements PluginLoader {
  private readonly entries: Map<string, BuiltinPluginEntry>;

  /**
   * @zh 创建一个内置插件 loader。
   * @en Create a builtin plugin loader.
   *
   * @param entries - {@zh 内置插件条目列表} {@en Builtin plugin entries}
   */
  public constructor(entries: BuiltinPluginEntry[]) {
    this.entries = new Map(entries.map((entry) => [entry.manifest.id, entry]));
  }

  /**
   * @zh 读取指定插件的 manifest。
   * @en Get the manifest for a builtin plugin.
   *
   * @param pluginId - {@zh 插件 ID} {@en Plugin ID}
   * @returns - {@zh 插件 manifest} {@en Plugin manifest}
   */
  public async getManifest(pluginId: string): Promise<PluginManifest> {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`Builtin plugin ${pluginId} not found`);
    }

    return entry.manifest;
  }

  /**
   * @zh 读取指定插件的展示数据。
   * @en Get the display data for a builtin plugin.
   *
   * @param pluginId - {@zh 插件 ID} {@en Plugin ID}
   * @returns - {@zh 插件展示数据} {@en Plugin display data}
   */
  public async getData(pluginId: string): Promise<PluginData> {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`Builtin plugin ${pluginId} not found`);
    }

    return entry.data;
  }

  /**
   * @zh 加载指定内置插件实例。
   * @en Load the builtin plugin instance for the given plugin.
   *
   * @param pluginId - {@zh 插件 ID} {@en Plugin ID}
   * @returns - {@zh 插件实例} {@en Plugin instance}
   */
  public async getInstance(pluginId: string): Promise<CatPlugin> {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`Builtin plugin ${pluginId} not found`);
    }

    return await entry.load();
  }

  /**
   * @zh 列出当前 catalog 中可用的内置插件 manifest。
   * @en List all builtin plugin manifests available in the catalog.
   *
   * @returns - {@zh 内置插件 manifest 列表} {@en Builtin plugin manifests}
   */
  public async listAvailablePlugins(): Promise<PluginManifest[]> {
    return [...this.entries.values()].map((entry) => entry.manifest);
  }

  /**
   * @zh 在内置插件资产根目录中安全解析相对路径。
   * @en Securely resolve a relative asset path inside the builtin asset root.
   *
   * @param pluginId - {@zh 插件 ID} {@en Plugin ID}
   * @param relativePath - {@zh 资源相对路径} {@en Relative asset path}
   * @returns - {@zh 解析后的绝对路径；无法解析时为 `null`} {@en Resolved absolute path, or `null` when unavailable}
   */
  public async resolveAssetPath(
    pluginId: string,
    relativePath: string,
  ): Promise<string | null> {
    const root = this.entries.get(pluginId)?.assetRoot;
    if (!root) return null;

    const rootPath = resolve(root);
    const targetPath = resolve(rootPath, relativePath);
    return targetPath !== rootPath && targetPath.startsWith(rootPath + sep)
      ? targetPath
      : null;
  }
}
