import type { CatPlugin } from "@/entities/plugin";
import {
  PluginDataSchema,
  PluginManifestSchema,
  type PluginData,
  type PluginManifest,
} from "@cat/shared/schema/plugin";
import { logger } from "@cat/shared/utils";
import { existsSync } from "node:fs";
import { access, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import z from "zod";

const PluginObjectSchema = z.custom<CatPlugin>();

export interface PluginLoader {
  getManifest: (pluginId: string) => Promise<PluginManifest>;
  getData: (pluginId: string) => Promise<PluginData>;
  getInstance: (pluginId: string) => Promise<CatPlugin>;
  listAvailablePlugins: () => Promise<PluginManifest[]>;
}

export class FileSystemPluginLoader implements PluginLoader {
  private readonly pluginsDir: string;

  constructor(pluginsDir?: string) {
    this.pluginsDir = pluginsDir ?? join(process.cwd(), "plugins");
  }

  private getPluginFsPath = (id: string): string => join(this.pluginsDir, id);

  private getPluginEntryFsPath = async (id: string): Promise<string> => {
    const manifest = await this.getManifest(id);
    return join(this.getPluginFsPath(id), manifest.entry);
  };

  public getManifest = async (pluginId: string): Promise<PluginManifest> => {
    const dirPath = this.getPluginFsPath(pluginId);
    const manifestPath = join(dirPath, "manifest.json");

    try {
      await access(manifestPath);
    } catch {
      logger.debug("PLUGIN", {
        msg: `Plugin ${pluginId} missing manifest.json`,
      });
      throw new Error(`Plugin ${pluginId} missing manifest.json`);
    }

    const data = await readFile(manifestPath, "utf8");
    return PluginManifestSchema.parse(JSON.parse(data));
  };

  public getData = async (pluginId: string): Promise<PluginData> => {
    const dir = this.getPluginFsPath(pluginId);
    const manifestPath = join(dir, "manifest.json");
    const packageDotJsonPath = join(dir, "package.json");
    const readmePath = join(dir, "README.md");

    const rawManifest = await readFile(manifestPath, "utf-8");
    const rawREADME = await readFile(readmePath, "utf-8").catch(() => null);

    const manifest = PluginManifestSchema.parse(JSON.parse(rawManifest));
    const { name, version } = z
      .object({ name: z.string(), version: z.string() })
      .parse(JSON.parse(await readFile(packageDotJsonPath, "utf-8")));

    return PluginDataSchema.parse({
      ...manifest,
      name,
      version,
      overview: rawREADME,
    });
  };

  public getInstance = async (pluginId: string): Promise<CatPlugin> => {
    const pluginFsPath = await this.getPluginEntryFsPath(pluginId);
    const pluginUrl = pathToFileURL(pluginFsPath).href;
    const imported: unknown = await import(/* @vite-ignore */ pluginUrl);

    if (
      imported &&
      typeof imported === "object" &&
      "default" in imported &&
      typeof imported.default === "object"
    ) {
      return PluginObjectSchema.parse(imported.default);
    }

    throw new Error(
      `Plugin ${pluginId} does not have a default export plugin object`,
    );
  };

  /**
   * 返回当前 loader 中包含的所有插件的 manifest
   */
  public listAvailablePlugins = async (): Promise<PluginManifest[]> => {
    if (!existsSync(this.pluginsDir)) await mkdir(this.pluginsDir);
    const dirs = (
      await readdir(this.pluginsDir, { withFileTypes: true })
    ).filter((dirent) => dirent.isDirectory());

    const results: PluginManifest[] = [];
    await Promise.all(
      dirs.map(async (dir) => {
        try {
          const manifest = await this.getManifest(dir.name);
          results.push(manifest);
        } catch (err) {
          logger.error(
            "PLUGIN",
            { msg: `Error reading manifest.json in ${dir.name}:` },
            err,
          );
        }
      }),
    );

    return results;
  };
}
