import { pathToFileURL } from "url";
import { prisma } from "@cat/db";
import { z } from "zod/v4";
import { logger } from "@cat/shared";
import { join } from "path";
import { TextVectorizer } from "./text-vectorizer";
import { TranslatableFileHandler } from "./translatable-file-handler";
import { TranslationAdvisor } from "./translation-advisor";

const pluginsDir = join(process.cwd(), "plugins");

export interface CatPlugin {
  onLoaded: () => Promise<void>;
  getTextVectorizers?: () => TextVectorizer[];
  getTranslatableFileHandlers?: () => TranslatableFileHandler[];
  getTranslationAdvisors?: () => TranslationAdvisor[];
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

    await instance.onLoaded();

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
}
