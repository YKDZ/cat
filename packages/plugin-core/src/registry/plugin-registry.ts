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
import type { PrismaClient } from "@cat/db";
import { getMergedPluginConfigs } from "../utils/config";
import { TermService } from "./term-service";

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
}

const PluginObjectSchema = z.custom<CatPlugin>();

export class PluginRegistry {
  private plugins: Map<string, CatPlugin> = new Map();

  public constructor() {}

  public async loadPlugins(prisma: PrismaClient, options?: LoadPluginsOptions) {
    this.plugins.clear();
    if (!options?.silent)
      logger.info("PLUGIN", { msg: "Prepared to load plugins..." });

    const plugins = await prisma.plugin.findMany({
      where: {
        enabled: true,
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
    prisma: PrismaClient,
    pluginId: string,
    instance: CatPlugin,
  ) {
    this.plugins.set(pluginId, instance);
    const configs = await getMergedPluginConfigs(prisma, pluginId);

    logger.debug("PLUGIN", {
      msg: `About to load plugin '${pluginId}' with configs: ${JSON.stringify(configs)}`,
    });

    await instance.onLoaded({
      configs,
    });
  }

  public getPlugins(): Map<string, CatPlugin> {
    return this.plugins;
  }

  public getPluginEntryFsPath(id: string, entry: string): string {
    return join(this.getPlugiFsPath(id), entry);
  }

  public getPlugiFsPath(id: string): string {
    return join(pluginsDir, id);
  }

  public async getTranslationAdvisors(
    prisma: PrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; advisor: TranslationAdvisor }>> {
    const ids = Array.from(this.plugins.keys());
    const results = await Promise.all(
      ids.map(async (id) => {
        const advisors = await this.getTranslationAdvisor(prisma, id, options);
        return advisors.map((advisor) => ({ pluginId: id, advisor }));
      }),
    );
    return results.flat();
  }

  public async getTextVectorizers(
    prisma: PrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; vectorizer: TextVectorizer }>> {
    const ids = Array.from(this.plugins.keys());
    const results = await Promise.all(
      ids.map(async (id) => {
        const vectorizers = await this.getTextVectorizer(prisma, id, options);
        return vectorizers.map((vectorizer) => ({ pluginId: id, vectorizer }));
      }),
    );
    return results.flat();
  }

  public async getTranslatableFileHandlers(
    prisma: PrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; handler: TranslatableFileHandler }>> {
    const ids = Array.from(this.plugins.keys());
    const results = await Promise.all(
      ids.map(async (id) => {
        const handlers = await this.getTranslatableFileHandler(
          prisma,
          id,
          options,
        );
        return handlers.map((handler) => ({ pluginId: id, handler }));
      }),
    );
    return results.flat();
  }

  public async getAuthProviders(
    prisma: PrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; provider: AuthProvider }>> {
    const ids = Array.from(this.plugins.keys());
    const results = await Promise.all(
      ids.map(async (id) => {
        const providers = await this.getAuthProvider(prisma, id, options);
        return providers.map((provider) => ({ pluginId: id, provider }));
      }),
    );
    return results.flat();
  }

  public async getTermServices(
    prisma: PrismaClient,
    options?: GetterOptions,
  ): Promise<Array<{ pluginId: string; service: TermService }>> {
    const ids = Array.from(this.plugins.keys());
    const results = await Promise.all(
      ids.map(async (id) => {
        const services = await this.getTermService(prisma, id, options);
        return services.map((service) => ({ pluginId: id, service }));
      }),
    );
    return results.flat();
  }

  public async getTranslationAdvisor(
    prisma: PrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TranslationAdvisor[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.getTranslationAdvisors) return [];
    const configs = await getMergedPluginConfigs(prisma, pluginId, {
      projectId: options?.projectId,
      userId: options?.userId,
    });
    return plugin.getTranslationAdvisors({ configs }) ?? [];
  }

  public async getTextVectorizer(
    prisma: PrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TextVectorizer[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.getTextVectorizers) return [];
    const configs = await getMergedPluginConfigs(prisma, pluginId, {
      projectId: options?.projectId,
      userId: options?.userId,
    });
    return plugin.getTextVectorizers({ configs }) ?? [];
  }

  public async getTranslatableFileHandler(
    prisma: PrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TranslatableFileHandler[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.getTranslatableFileHandlers) return [];
    const configs = await getMergedPluginConfigs(prisma, pluginId, {
      projectId: options?.projectId,
      userId: options?.userId,
    });
    return plugin.getTranslatableFileHandlers({ configs }) ?? [];
  }

  public async getAuthProvider(
    prisma: PrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<AuthProvider[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.getAuthProviders) return [];
    const configs = await getMergedPluginConfigs(prisma, pluginId, {
      projectId: options?.projectId,
      userId: options?.userId,
    });
    return plugin.getAuthProviders({ configs }) ?? [];
  }

  public async getTermService(
    prisma: PrismaClient,
    pluginId: string,
    options?: GetterOptions,
  ): Promise<TermService[]> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.getTermServices) return [];
    const configs = await getMergedPluginConfigs(prisma, pluginId, {
      projectId: options?.projectId,
      userId: options?.userId,
    });
    return plugin.getTermServices({ configs }) ?? [];
  }

  public async reload(prisma: PrismaClient, options?: LoadPluginsOptions) {
    this.plugins = new Map();
    await this.loadPlugins(prisma, options);
  }

  public async getPluginManifest(pluginId: string) {
    const dirPath = this.getPlugiFsPath(pluginId);
    const manifestPath = join(dirPath, "manifest.json");

    if (!existsSync(manifestPath)) {
      logger.debug("PLUGIN", { msg: `Plugin pluginId missing manifest.json` });
      throw new Error(`Plugin pluginId missing manifest.json`);
    }

    const data = await readFile(manifestPath, "utf8");
    return PluginManifestSchema.parse(JSON.parse(data));
  }

  public async getPluginIdInLocalPlugins() {
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

  public async getPluginComponentFsPath(
    pluginId: string,
    componentId: string,
  ): Promise<string> {
    const manifest = await this.getPluginManifest(pluginId);
    if (!manifest.components)
      throw new Error(
        `Plugin ${pluginId} do not have components defined in manifest.json`,
      );
    const component = manifest.components.find(
      (component) => component.id === componentId,
    );
    if (!component)
      throw new Error(
        `Plugin ${pluginId} do not have component ${componentId} defined in manifest.json`,
      );
    return join(this.getPlugiFsPath(pluginId), component.entry);
  }
}
