import type { PluginData, PluginManifest } from "@cat/shared";

import type { CatPlugin } from "@/entities/plugin";

import type { PluginLoader } from "./loader";

/**
 * Compose multiple loaders into a fallback-based loader.
 */
export class CompositePluginLoader implements PluginLoader {
  /**
   * Create a composite plugin loader.
   *
   * @param loaders - Loaders ordered by priority
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
   * Resolve a plugin manifest by loader priority.
   */
  public async getManifest(pluginId: string): Promise<PluginManifest> {
    return this.first(pluginId, async (loader) => loader.getManifest(pluginId));
  }

  /**
   * Resolve plugin display data by loader priority.
   */
  public async getData(pluginId: string): Promise<PluginData> {
    return this.first(pluginId, async (loader) => loader.getData(pluginId));
  }

  /**
   * Resolve a plugin instance by loader priority.
   */
  public async getInstance(pluginId: string): Promise<CatPlugin> {
    return this.first(pluginId, async (loader) => loader.getInstance(pluginId));
  }

  /**
   * List all plugins from the composite loader, deduplicated by first occurrence.
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
   * Try to resolve a plugin asset path by loader priority.
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
