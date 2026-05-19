import type { PluginData, PluginManifest } from "@cat/shared";

import type { CatPlugin } from "@/entities/plugin";

import type { PluginLoader } from "./loader";

/**
 * @zh 将多个 loader 组合为一个按顺序回退的 loader。
 * @en Compose multiple loaders into a fallback-based loader.
 */
export class CompositePluginLoader implements PluginLoader {
  /**
   * @zh 创建一个组合 loader。
   * @en Create a composite plugin loader.
   *
   * @param loaders - {@zh 按优先级排序的 loader 列表} {@en Loaders ordered by priority}
   */
  public constructor(private readonly loaders: PluginLoader[]) {}

  private async first<T>(
    pluginId: string,
    fn: (loader: PluginLoader) => Promise<T>,
    index = 0,
    errors: unknown[] = [],
  ): Promise<T> {
    const loader = this.loaders[index];

    if (!loader) {
      throw new Error(
        `Plugin ${pluginId} not found in composite loader: ${errors
          .map(String)
          .join("; ")}`,
      );
    }

    try {
      return await fn(loader);
    } catch (error) {
      return this.first(pluginId, fn, index + 1, [...errors, error]);
    }
  }

  /**
   * @zh 按优先级获取插件 manifest。
   * @en Resolve a plugin manifest by loader priority.
   */
  public async getManifest(pluginId: string): Promise<PluginManifest> {
    return this.first(pluginId, async (loader) => loader.getManifest(pluginId));
  }

  /**
   * @zh 按优先级获取插件展示数据。
   * @en Resolve plugin display data by loader priority.
   */
  public async getData(pluginId: string): Promise<PluginData> {
    return this.first(pluginId, async (loader) => loader.getData(pluginId));
  }

  /**
   * @zh 按优先级加载插件实例。
   * @en Resolve a plugin instance by loader priority.
   */
  public async getInstance(pluginId: string): Promise<CatPlugin> {
    return this.first(pluginId, async (loader) => loader.getInstance(pluginId));
  }

  /**
   * @zh 列出组合 loader 中的全部插件，并按首次出现去重。
   * @en List all plugins from the composite loader, deduplicated by first occurrence.
   */
  public async listAvailablePlugins(): Promise<PluginManifest[]> {
    const manifestsByLoader = await Promise.all(
      this.loaders.map(async (loader) => loader.listAvailablePlugins()),
    );
    const seen = new Set<string>();
    const manifests: PluginManifest[] = [];

    for (const loaderManifests of manifestsByLoader) {
      for (const manifest of loaderManifests) {
        if (seen.has(manifest.id)) {
          continue;
        }
        seen.add(manifest.id);
        manifests.push(manifest);
      }
    }

    return manifests;
  }

  /**
   * @zh 按优先级尝试解析插件静态资源路径。
   * @en Try to resolve a plugin asset path by loader priority.
   */
  public async resolveAssetPath(
    pluginId: string,
    relativePath: string,
  ): Promise<string | null> {
    const resolvedPaths = await Promise.all(
      this.loaders.map(async (loader) =>
        loader.resolveAssetPath?.(pluginId, relativePath),
      ),
    );

    return (
      resolvedPaths.find(
        (resolved): resolved is string => typeof resolved === "string",
      ) ?? null
    );
  }
}
