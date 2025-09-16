import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { JSONSchemaSchema, type JSONType } from "@cat/shared/schema/json";
import { OverallPrismaClient, PrismaClient, ScopeType } from "@cat/db";
import { getDefaultFromSchema, logger } from "@cat/shared/utils";
import { PluginManifestSchema } from "@cat/shared/schema/plugin";
import type { PluginManifest } from "@cat/shared/schema/plugin";
import { getPluginConfig } from "@/utils/config.ts";
import type { TranslationAdvisor } from "@/registry/translation-advisor.ts";
import type { TranslatableFileHandler } from "@/registry/translatable-file-handler.ts";
import type { TextVectorizer } from "@/registry/text-vectorizer.ts";
import type { TermService } from "@/registry/term-service.ts";
import type { StorageProvider } from "@/registry/storage-provider.ts";
import type { AuthProvider } from "@/registry/auth-provider.ts";

declare global {
  var __PLUGIN_REGISTRY__: PluginRegistry | undefined;
}

const pluginsDir = join(process.cwd(), "plugins");

export type PluginLoadOptions = {
  config: JSONType;
};

export type LoadPluginsOptions = {
  tags?: string[];
};

export type PluginGetterOptions = {
  config?: JSONType;
};

export type GetterOptions = {
  projectId?: string;
  userId?: string;
};

export interface CatPlugin {
  onInstalled?: () => Promise<void>;
  onLoaded?: (options: PluginLoadOptions) => Promise<void>;
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

type ServiceConfig = {
  getter: (
    prisma: OverallPrismaClient,
    pluginId: string,
    plugin: CatPlugin,
  ) => Promise<{ getId: () => string }[]>;
  key: Services;
};

type Services = keyof Pick<
  OverallPrismaClient,
  | "authProvider"
  | "termService"
  | "translationAdvisor"
  | "storageProvider"
  | "textVectorizer"
  | "translatableFileHandler"
>;

const createServiceConfigs = (
  pluginRegistry: PluginRegistry,
): ServiceConfig[] => [
  {
    getter: pluginRegistry.getAuthProviderFromObject.bind(pluginRegistry),
    key: "authProvider",
  },
  {
    getter: pluginRegistry.getStorageProviderFromObject.bind(pluginRegistry),
    key: "storageProvider",
  },
  {
    getter:
      pluginRegistry.getTranslatableFileHandlerFromObject.bind(pluginRegistry),
    key: "translatableFileHandler",
  },
  {
    getter: pluginRegistry.getTextVectorizerFromObject.bind(pluginRegistry),
    key: "textVectorizer",
  },
  {
    getter: pluginRegistry.getTranslationAdvisorFromObject.bind(pluginRegistry),
    key: "translationAdvisor",
  },
  {
    getter: pluginRegistry.getTermServiceFromObject.bind(pluginRegistry),
    key: "termService",
  },
];

const importPluginServices = async <
  T extends {
    getId(): string;
  },
>(
  prisma: OverallPrismaClient,
  pluginId: string,
  plugin: CatPlugin,
  pluginInstallationId: number,
  getServices: (
    prisma: OverallPrismaClient,
    pluginId: string,
    plugin: CatPlugin,
  ) => Promise<T[]>,
  key: Services,
): Promise<void> => {
  const ids = (await getServices(prisma, pluginId, plugin)).map((service) => {
    return service.getId();
  });
  await prisma[key].createMany({
    data: ids.map((id) => ({ serviceId: id, pluginInstallationId })),
  });
};

const PluginObjectSchema = z.custom<CatPlugin>();

export class PluginRegistry {
  public plugins: Map<string, CatPlugin> = new Map();

  public constructor() {}

  public static get(): PluginRegistry {
    if (!globalThis["__PLUGIN_REGISTRY__"]) {
      const pluginRegistry = new PluginRegistry();
      globalThis["__PLUGIN_REGISTRY__"] = pluginRegistry;
    }
    return globalThis["__PLUGIN_REGISTRY__"]!;
  }

  public async installPlugin(
    prisma: PrismaClient,
    pluginId: string,
    scopeType: ScopeType,
    scopeId: string,
  ) {
    const dbPlugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
      select: {
        entry: true,
      },
    });

    if (!dbPlugin) throw new Error(`Plugin ${pluginId} not found`);

    const serviceConfigs = createServiceConfigs(this);

    logger.info("PLUGIN", {
      msg: `About to install plugin ${pluginId} in ${scopeType} ${scopeId}`,
    });

    const pluginObj = await this.getPluginObject(pluginId, dbPlugin.entry);
    if (pluginObj.onInstalled) await pluginObj.onInstalled();

    await prisma.$transaction(async (tx) => {
      const installation = await tx.pluginInstallation.create({
        data: { pluginId, scopeType, scopeId },
      });

      const pluginConfigs = await tx.pluginConfig.findMany({
        where: {
          pluginId,
        },
        select: { id: true, schema: true },
      });

      for (const { id, schema } of pluginConfigs) {
        const defaultValue =
          getDefaultFromSchema(JSONSchemaSchema.parse(schema)) ?? {};

        await tx.pluginConfigInstance.create({
          data: {
            configId: id,
            pluginInstallationId: installation.id,
            value: defaultValue,
          },
        });
      }

      for (const { getter, key } of serviceConfigs) {
        await importPluginServices(
          tx,
          pluginId,
          pluginObj,
          installation.id,
          getter,
          key,
        );
      }
    });
  }

  public async uninstallPlugin(
    prisma: PrismaClient,
    pluginId: string,
    scopeType: ScopeType,
    scopeId: string,
  ) {
    const dbPlugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!dbPlugin) throw new Error(`Plugin ${pluginId} not found`);

    const installation = await prisma.pluginInstallation.findUnique({
      where: { scopeId_scopeType_pluginId: { pluginId, scopeType, scopeId } },
    });

    if (!installation) throw new Error(`Plugin ${pluginId} not installed`);

    await prisma.pluginInstallation.delete({
      where: { scopeId_scopeType_pluginId: { pluginId, scopeType, scopeId } },
    });
  }

  public async loadPlugins(
    prisma: OverallPrismaClient,
    options?: LoadPluginsOptions,
  ): Promise<void> {
    this.plugins.clear();
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
      logger.info("PLUGIN", { msg: "No plugins to load." });
      return;
    }

    for (const { id, entry } of plugins) {
      try {
        logger.info("PLUGIN", {
          msg: `About to load plugin '${id}'`,
        });

        const pluginObj = await this.getPluginObject(id, entry);

        await this.loadPlugin(prisma, id, pluginObj);

        logger.info("PLUGIN", {
          msg: `Successfully loaded plugin: ${id}`,
        });
      } catch (err) {
        logger.error("PLUGIN", { msg: `Failed to load plugin '${id}'` }, err);
        continue;
      }
    }
  }

  private async getPluginObject(pluginId: string, entry: string) {
    const pluginFsPath = this.getPluginEntryFsPath(pluginId, entry);
    // Vite build will sometimes remove inline /* @vite-ignore */ comments
    // and cause runtime warning
    const pluginUrl = /* @vite-ignore */ pathToFileURL(pluginFsPath).href;
    const imported = await import(/* @vite-ignore */ pluginUrl);
    return PluginObjectSchema.parse(imported.default ?? imported);
  }

  private async loadPlugin(
    prisma: OverallPrismaClient,
    pluginId: string,
    instance: CatPlugin,
  ): Promise<void> {
    this.plugins.set(pluginId, instance);
    const config = await getPluginConfig(prisma, pluginId);

    logger.debug("PLUGIN", {
      msg: `About to load plugin '${pluginId}' with configs: ${JSON.stringify(config)}`,
    });

    try {
      if (instance.onLoaded)
        await instance.onLoaded({
          config,
        });
    } catch (err) {
      logger.error(
        "PLUGIN",
        {
          msg: `Error when running plugin '${pluginId}''s 'onLoaded' hook`,
        },
        err,
      );
    }
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
    plugin: CatPlugin,
    pluginId: string,
    getterMethodName: keyof CatPlugin,
    options?: GetterOptions,
  ): Promise<T[]> {
    const getter = plugin[getterMethodName] as
      | ((options: PluginGetterOptions) => T[])
      | undefined;

    if (!plugin || !getter) return [];

    const config =
      (await getPluginConfig(prisma, pluginId, {
        projectId: options?.projectId,
        userId: options?.userId,
      })) ?? {};

    try {
      return getter.bind(plugin)({ config }) ?? [];
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

  public async getTranslationAdvisorFromObject(
    prisma: OverallPrismaClient,
    pluginId: string,
    plugin: CatPlugin,
    options?: GetterOptions,
  ): Promise<TranslationAdvisor[]> {
    return this.getPluginService<TranslationAdvisor>(
      prisma,
      plugin,
      pluginId,
      "getTranslationAdvisors",
      options,
    );
  }

  public async getTranslationAdvisor(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TranslationAdvisor[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    return this.getTranslationAdvisorFromObject(
      prisma,
      pluginId,
      plugin,
      options,
    );
  }

  public async getTextVectorizerFromObject(
    prisma: OverallPrismaClient,
    pluginId: string,
    plugin: CatPlugin,
    options?: GetterOptions,
  ): Promise<TextVectorizer[]> {
    return this.getPluginService<TextVectorizer>(
      prisma,
      plugin,
      pluginId,
      "getTextVectorizers",
      options,
    );
  }

  public async getTextVectorizer(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TextVectorizer[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    return this.getTextVectorizerFromObject(prisma, pluginId, plugin, options);
  }

  public async getTranslatableFileHandlerFromObject(
    prisma: OverallPrismaClient,
    pluginId: string,
    plugin: CatPlugin,
    options?: GetterOptions,
  ): Promise<TranslatableFileHandler[]> {
    return this.getPluginService<TranslatableFileHandler>(
      prisma,
      plugin,
      pluginId,
      "getTranslatableFileHandlers",
      options,
    );
  }

  public async getTranslatableFileHandler(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TranslatableFileHandler[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    return this.getTranslatableFileHandlerFromObject(
      prisma,
      pluginId,
      plugin,
      options,
    );
  }

  public async getAuthProviderFromObject(
    prisma: OverallPrismaClient,
    pluginId: string,
    plugin: CatPlugin,
    options?: GetterOptions,
  ): Promise<AuthProvider[]> {
    return this.getPluginService<AuthProvider>(
      prisma,
      plugin,
      pluginId,
      "getAuthProviders",
      options,
    );
  }

  public async getAuthProvider(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<AuthProvider[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    return this.getAuthProviderFromObject(prisma, pluginId, plugin, options);
  }

  public async getTermServiceFromObject(
    prisma: OverallPrismaClient,
    pluginId: string,
    plugin: CatPlugin,
    options?: GetterOptions,
  ): Promise<TermService[]> {
    return this.getPluginService<TermService>(
      prisma,
      plugin,
      pluginId,
      "getTermServices",
      options,
    );
  }

  public async getTermService(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TermService[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    return this.getTermServiceFromObject(prisma, pluginId, plugin, options);
  }

  public async getStorageProviderFromObject(
    prisma: OverallPrismaClient,
    pluginId: string,
    plugin: CatPlugin,
    options?: GetterOptions,
  ): Promise<StorageProvider[]> {
    return this.getPluginService<StorageProvider>(
      prisma,
      plugin,
      pluginId,
      "getStorageProviders",
      options,
    );
  }

  public async getStorageProvider(
    prisma: OverallPrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<StorageProvider[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    return this.getStorageProviderFromObject(prisma, pluginId, plugin, options);
  }

  public async reload(
    prisma: OverallPrismaClient,
    options?: LoadPluginsOptions,
  ): Promise<void> {
    this.plugins = new Map();
    await this.loadPlugins(prisma, options);
  }

  public async getPluginManifest(pluginId: string): Promise<PluginManifest> {
    const dirPath = this.getPluginFsPath(pluginId);
    const manifestPath = join(dirPath, "manifest.json");

    if (!existsSync(manifestPath)) {
      logger.debug("PLUGIN", {
        msg: `Plugin ${pluginId} missing manifest.json`,
      });
      throw new Error(`Plugin ${pluginId} missing manifest.json`);
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
        const manifest = PluginManifestSchema.parse(JSON.parse(data));

        results.push(manifest.id);
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
