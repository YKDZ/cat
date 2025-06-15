import { pathToFileURL } from "url";
import { prisma } from "@cat/db";
import { z } from "zod/v4";
import type { PluginConfig } from "@cat/shared";
import { logger, PluginConfigSchema } from "@cat/shared";
import { join } from "path";
import type { TextVectorizer } from "./text-vectorizer";
import type { TranslatableFileHandler } from "./translatable-file-handler";
import type { TranslationAdvisor } from "./translation-advisor";
import type { AuthProvider } from "./auth-provider";
import { existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";

const pluginsDir = join(process.cwd(), "plugins");

export type PluginLoadOptions = {
  configs: PluginConfig[];
};

export interface CatPlugin {
  onLoaded: (options: PluginLoadOptions) => Promise<void>;
  getTextVectorizers?: () => TextVectorizer[];
  getTranslatableFileHandlers?: () => TranslatableFileHandler[];
  getTranslationAdvisors?: () => TranslationAdvisor[];
  getAuthProviders?: () => AuthProvider[];
}

const PluginObjectSchema = z.custom<CatPlugin>();

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, CatPlugin> = new Map();

  private constructor() {}

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  public async loadPlugins() {
    this.plugins.clear();
    logger.info("PLUGIN", "Prepared to load plugins...");

    const plugins = await prisma.plugin.findMany({
      where: {
        enabled: true,
      },
      select: {
        id: true,
        entry: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (plugins.length === 0) {
      logger.info("PLUGIN", "No plugins to load.");
    }

    for (const { id, entry } of plugins) {
      try {
        let pluginObj: CatPlugin;

        try {
          const pluginFsPath = PluginRegistry.getPluginEntryFsPath(id, entry);
          // Vite build will sometimes remove inline /* @vite-ignore */ comments
          // and cause runtime warning
          const pluginUrl = /* @vite-ignore */ pathToFileURL(pluginFsPath).href;
          logger.info(
            "PLUGIN",
            `About to load plugin '${id}' from: ${pluginUrl}`,
          );
          const imported = await import(/* @vite-ignore */ pluginUrl);
          pluginObj = PluginObjectSchema.parse(imported.default ?? imported);
        } catch (importErr) {
          logger.error("PLUGIN", `Failed to load plugin '${id}'`, importErr);
          continue;
        }

        await this.loadPlugin(id, pluginObj);
      } catch (loadErr) {
        logger.error(
          "PLUGIN",
          `Unexpected error loading plugin '${id}'`,
          loadErr,
        );
      }
    }
  }

  private async loadPlugin(id: string, instance: CatPlugin) {
    this.plugins.set(id, instance);

    const configs = z.array(PluginConfigSchema).parse(
      await prisma.pluginConfig.findMany({
        where: {
          pluginId: id,
        },
      }),
    );

    await instance.onLoaded({ configs });

    logger.info("PLUGIN", `Successfully loaded plugin: ${id}`);
  }

  public getPlugins(): Map<string, CatPlugin> {
    return this.plugins;
  }

  public static getPluginEntryFsPath(id: string, entry: string): string {
    return join(PluginRegistry.getPlugiFsPath(id), entry);
  }

  public static getPlugiFsPath(id: string): string {
    return join(pluginsDir, id);
  }

  public getTranslationAdvisors(): TranslationAdvisor[] {
    return Array.from(this.plugins.values())
      .map((plugin) => plugin.getTranslationAdvisors?.())
      .filter(
        (advisors): advisors is TranslationAdvisor[] => advisors !== undefined,
      )
      .flat();
  }

  public getTextVectorizers(): TextVectorizer[] {
    return Array.from(this.plugins.values())
      .map((plugin) => plugin.getTextVectorizers?.())
      .filter(
        (vectorizers): vectorizers is TextVectorizer[] =>
          vectorizers !== undefined,
      )
      .flat();
  }

  public getTranslatableFileHandlers(): TranslatableFileHandler[] {
    return Array.from(this.plugins.values())
      .map((plugin) => plugin.getTranslatableFileHandlers?.())
      .filter(
        (handlers): handlers is TranslatableFileHandler[] =>
          handlers !== undefined,
      )
      .flat();
  }

  public getAuthProviders(): AuthProvider[] {
    return Array.from(this.plugins.values())
      .map((plugin) => plugin.getAuthProviders?.())
      .filter((handlers): handlers is AuthProvider[] => handlers !== undefined)
      .flat();
  }

  public async reload() {
    this.plugins = new Map();
    await this.loadPlugins();
  }

  public static async getPluginIdInLocalPlugins() {
    const dirents = readdirSync(pluginsDir, { withFileTypes: true }).filter(
      (dirent) => dirent.isDirectory(),
    );

    const results = [];

    for (const dirent of dirents) {
      const dirPath = join(pluginsDir, dirent.name);
      const manifestPath = join(dirPath, "manifest.json");

      if (!existsSync(manifestPath)) {
        console.error(`Directory ${dirent.name} missing manifest.json`);
        continue;
      }

      try {
        const data = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(data);

        if (manifest.id) {
          results.push(manifest.id);
        } else {
          console.error(`manifest.json in ${dirent.name} missing "id" field`);
        }
      } catch (err) {
        logger.error(
          "PLUGIN",
          `Error reading manifest.json in ${dirent.name}:`,
          err,
        );
      }
    }

    return results;
  }
}
