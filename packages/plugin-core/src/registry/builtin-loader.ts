import type { PluginData, PluginManifest } from "@cat/shared";

import { resolve, sep } from "node:path";

import type { CatPlugin } from "@/entities/plugin";

import type { PluginLoader } from "./loader";

/**
 * Single plugin entry inside the builtin plugin catalog.
 */
export type BuiltinPluginEntry = {
  /** Plugin manifest. */
  manifest: PluginManifest;
  /** Plugin display data. */
  data: PluginData;
  /** Loader function returning the plugin instance. */
  load: () => Promise<CatPlugin> | CatPlugin;
  /** Optional root directory for static assets. */
  assetRoot?: string;
};

/**
 * Builtin plugin loader backed by a static catalog.
 */
export class BuiltinPluginLoader implements PluginLoader {
  private readonly entries: Map<string, BuiltinPluginEntry>;

  /**
   * Create a builtin plugin loader.
   *
   * @param entries - Builtin plugin entries
   */
  public constructor(entries: BuiltinPluginEntry[]) {
    this.entries = new Map(entries.map((entry) => [entry.manifest.id, entry]));
  }

  /**
   * Get the manifest for a builtin plugin.
   *
   * @param pluginId - Plugin ID
   * @returns - Plugin manifest
   */
  public async getManifest(pluginId: string): Promise<PluginManifest> {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`Builtin plugin ${pluginId} not found`);
    }

    return entry.manifest;
  }

  /**
   * Get the display data for a builtin plugin.
   *
   * @param pluginId - Plugin ID
   * @returns - Plugin display data
   */
  public async getData(pluginId: string): Promise<PluginData> {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`Builtin plugin ${pluginId} not found`);
    }

    return entry.data;
  }

  /**
   * Load the builtin plugin instance for the given plugin.
   *
   * @param pluginId - Plugin ID
   * @returns - Plugin instance
   */
  public async getInstance(pluginId: string): Promise<CatPlugin> {
    const entry = this.entries.get(pluginId);
    if (!entry) {
      throw new Error(`Builtin plugin ${pluginId} not found`);
    }

    return await entry.load();
  }

  /**
   * List all builtin plugin manifests available in the catalog.
   *
   * @returns - Builtin plugin manifests
   */
  public async listAvailablePlugins(): Promise<PluginManifest[]> {
    return [...this.entries.values()].map((entry) => entry.manifest);
  }

  /**
   * Securely resolve a relative asset path inside the builtin asset root.
   *
   * @param pluginId - Plugin ID
   * @param relativePath - Relative asset path
   * @returns - Resolved absolute path, or `null` when unavailable
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
