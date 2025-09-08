import type { JSONType } from "@cat/shared";
import { logger, PluginManifestSchema } from "@cat/shared";
import { existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { z } from "zod";
import type { AuthProvider } from "./auth-provider";
import type { TextVectorizer } from "./text-vectorizer";
import type { TranslatableFileHandler } from "./translatable-file-handler";
import type { TranslationAdvisor } from "./translation-advisor";
import type { OverallPrismaClient } from "@cat/db";
import { getPluginConfigs } from "../utils/config";
import { TermService } from "./term-service";
import { StorageProvider } from "./storage-provider";

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  var __PLUGIN_REGISTRY__: PluginRegistry | undefined;
}

const pluginsDir = join(process.cwd(), "plugins");

export type PluginLoadOptions = {
  configs: Record<string, JSONType>;
};

export type LoadPluginsOptions = {
  silent?: boolean;
  tags?: string[];
};

export type PluginGetterOptions = {
  configs?: Record<string, JSONType>;
};

export type GetterOptions = {
  projectId?: string;
  userId?: string;
};

export interface CatPlugin {
  onLoaded: (options: PluginLoadOptions) => Promise<void>;
  getTextVectorizers?: (options: PluginGetterOptions) => TextVectorizer[];
  getTranslatableFileHandlers?: (
    options: PluginGetterOptions,
  ) => TranslatableFileHandler[];
  getTranslationAdvisors?: (
    options: PluginGetterOptions,
  ) => TranslationAdvisor[];
  getAuthProviders?: (options: PluginGetterOptions) => AuthProvider[];
  getTermServices?: (options: PluginGetterOptions) => TermService[];
  getStorageProviders?: (options: PluginGetterOptions) => StorageProvider[];
}

const PluginObjectSchema = z.custom<CatPlugin>();

export class PluginRegistry {
  public plugins: Map<string, CatPlugin> = new Map();

  public constructor() {}

  public static get() {
    if (!globalThis["__PLUGIN_REGISTRY__"]) {
      const pluginRegistry = new PluginRegistry();
      globalThis["__PLUGIN_REGISTRY__"] = pluginRegistry;
    }
    return globalThis["__PLUGIN_REGISTRY__"]!;
  }

  public async loadPlugins(
    prisma: OverallPrismaClient,
    options?: LoadPluginsOptions,
  ) {
    this.plugins.clear();
    if (!options?.silent)
      logger.info("PLUGIN", { msg: "Prepared to load plugins..." });

    const plugins = await prisma.plugin.findMany({
      where: {
        Tags: options?.tags
          ? {
              some: {
                name: {
                  in: options.tags,
                },
              },
            }
          : undefined,
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
      if (!options?.silent)
        logger.info("PLUGIN", { msg: "No plugins to load." });
    }

    for (const { id, entry } of plugins) {
      try {
        if (entry) {
          try {
            const pluginFsPath = this.getPluginEntryFsPath(id, entry);
            // Vite build will sometimes remove inline /* @vite-ignore */ comments
            // and cause runtime warning
            const pluginUrl =
              /* @vite-ignore */ pathToFileURL(pluginFsPath).href;
            if (!options?.silent)
              logger.info("PLUGIN", {
                msg: `About to load plugin '${id}' from: ${pluginUrl}`,
              });
            const imported = await import(/* @vite-ignore */ pluginUrl);
            const pluginObj = PluginObjectSchema.parse(
              imported.default ?? imported,
            );

            await this.loadPlugin(prisma, id, pluginObj);

            if (!options?.silent)
              logger.info("PLUGIN", {
                msg: `Successfully loaded plugin: ${id}`,
              });
          } catch (importErr) {
            logger.error(
              "PLUGIN",
              { msg: `Failed to load plugin '${id}'` },
              importErr,
            );
            continue;
          }
        } else {
          if (!options?.silent)
            logger.info("PLUGIN", {
              msg: `Successfully loaded plugin ${id} without entry`,
            });
        }
      } catch (loadErr) {
        logger.error(
          "PLUGIN",
          { msg: `Unexpected error loading plugin '${id}'` },
          loadErr,
        );
      }
    }
  }

  private async loadPlugin(
    prisma: OverallPrismaClient,
    pluginId: string,
    instance: CatPlugin,
  ) {
    this.plugins.set(pluginId, instance);
    const configs = await getPluginConfigs(prisma, pluginId);

    logger.debug("PLUGIN", {
      msg: `About to load plugin '${pluginId}' with configs: ${JSON.stringify(configs)}`,
    });

    await instance.onLoaded({
      configs,
    });
  }

  public getPluginEntryFsPath(id: string, entry: string): string {
    return join(this.getPluginFsPath(id), entry);
  }

  public getPluginFsPath(id: string): string {
    return join(pluginsDir, id);
  }

  private async getPluginServices<T, K extends string>(
    prisma: OverallPrismaClient,
    getSingleService: (
      prisma: OverallPrismaClient,
      pluginId: string,
      options?: GetterOptions,
    ) => Promise<T[]>,
    serviceKey: K,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string } & Record<K, T>>> {
    const ids = Array.from(this.plugins.keys());
    const results = await Promise.all(
      ids.map(async (id) => {
        const services = await getSingleService(prisma, id, options);
        return services.map(
          (service) =>
            ({ pluginId: id, [serviceKey]: service }) as {
              pluginId: string;
            } & Record<K, T>,
        );
      }),
    );
    return results.flat();
  }

  public async getTranslationAdvisors(
    prisma: OverallPrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; advisor: TranslationAdvisor }>> {
    return this.getPluginServices<TranslationAdvisor, "advisor">(
      prisma,
      this.getTranslationAdvisor.bind(this),
      "advisor",
      options,
    );
  }

  public async getTextVectorizers(
    prisma: OverallPrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; vectorizer: TextVectorizer }>> {
    return this.getPluginServices<TextVectorizer, "vectorizer">(
      prisma,
      this.getTextVectorizer.bind(this),
      "vectorizer",
      options,
    );
  }

  public async getTranslatableFileHandlers(
    prisma: OverallPrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; handler: TranslatableFileHandler }>> {
    return this.getPluginServices<TranslatableFileHandler, "handler">(
      prisma,
      this.getTranslatableFileHandler.bind(this),
      "handler",
      options,
    );
  }

  public async getAuthProviders(
    prisma: OverallPrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; provider: AuthProvider }>> {
    return this.getPluginServices<AuthProvider, "provider">(
      prisma,
      this.getAuthProvider.bind(this),
      "provider",
      options,
    );
  }

  public async getTermServices(
    prisma: OverallPrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; service: TermService }>> {
    return this.getPluginServices<TermService, "service">(
      prisma,
      this.getTermService.bind(this),
      "service",
      options,
    );
  }

  public async getStorageProviders(
    prisma: OverallPrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; provider: StorageProvider }>> {
    return this.getPluginServices<StorageProvider, "provider">(
      prisma,
      this.getStorageProvider.bind(this),
      "provider",
      options,
    );
  }

  private async getPluginService<T>(
    prisma: OverallPrismaClient,
    pluginId: string,
    getterMethodName: keyof CatPlugin,
    options?: GetterOptions,
  ): Promise<T[]> {
    const plugin = this.plugins.get(pluginId);

    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);

    const getter = plugin[getterMethodName] as
      | ((options: PluginGetterOptions) => T[])
      | undefined;

    if (!plugin || !getter) return [];

    const configs =
      (await getPluginConfigs(prisma, pluginId, {
        projectId: options?.projectId,
        userId: options?.userId,
      })) ?? {};

    try {
      return getter.bind(plugin)({ configs }) ?? [];
    } catch (e) {
      logger.error(
        "PLUGIN",
        {
          msg: `Error when getting services from plugin ${pluginId}`,
        },
        e,
      );
      throw e;
    }
  }

  public async getTranslationAdvisor(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TranslationAdvisor[]> {
    return this.getPluginService<TranslationAdvisor>(
      prisma,
      pluginId,
      "getTranslationAdvisors",
      options,
    );
  }

  public async getTextVectorizer(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TextVectorizer[]> {
    return this.getPluginService<TextVectorizer>(
      prisma,
      pluginId,
      "getTextVectorizers",
      options,
    );
  }

  public async getTranslatableFileHandler(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TranslatableFileHandler[]> {
    return this.getPluginService<TranslatableFileHandler>(
      prisma,
      pluginId,
      "getTranslatableFileHandlers",
      options,
    );
  }

  public async getAuthProvider(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<AuthProvider[]> {
    return this.getPluginService<AuthProvider>(
      prisma,
      pluginId,
      "getAuthProviders",
      options,
    );
  }

  public async getTermService(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TermService[]> {
    return this.getPluginService<TermService>(
      prisma,
      pluginId,
      "getTermServices",
      options,
    );
  }

  public async getStorageProvider(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<StorageProvider[]> {
    return this.getPluginService<StorageProvider>(
      prisma,
      pluginId,
      "getStorageProviders",
      options,
    );
  }

  public async reload(
    prisma: OverallPrismaClient,
    options?: LoadPluginsOptions,
  ) {
    this.plugins = new Map();
    await this.loadPlugins(prisma, options);
  }

  public async getPluginManifest(pluginId: string) {
    const dirPath = this.getPluginFsPath(pluginId);
    const manifestPath = join(dirPath, "manifest.json");

    if (!existsSync(manifestPath)) {
      logger.debug("PLUGIN", { msg: `Plugin pluginId missing manifest.json` });
      throw new Error(`Plugin pluginId missing manifest.json`);
    }

    const data = await readFile(manifestPath, "utf8");
    return PluginManifestSchema.parse(JSON.parse(data));
  }

  public async getPluginIdInLocalPlugins(): Promise<string[]> {
    const dirents = readdirSync(pluginsDir, { withFileTypes: true }).filter(
      (dirent) => dirent.isDirectory(),
    );

    const results = [];

    for (const dirent of dirents) {
      const dirPath = join(pluginsDir, dirent.name);
      const manifestPath = join(dirPath, "manifest.json");

      if (!existsSync(manifestPath)) {
        logger.warn("PLUGIN", {
          msg: `Directory ${dirent.name} missing manifest.json}`,
        });
        continue;
      }

      try {
        const data = await readFile(manifestPath, "utf8");
        const manifest = JSON.parse(data);

        if (manifest.id) {
          results.push(manifest.id);
        } else {
          logger.warn("PLUGIN", {
            msg: `manifest.json in ${dirent.name} missing "id" field`,
          });
        }
      } catch (err) {
        logger.error(
          "PLUGIN",
          { msg: `Error reading manifest.json in ${dirent.name}:` },
          err,
        );
      }
    }

    return results;
  }
}
