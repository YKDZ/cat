import { logger, PluginManifestSchema } from "@cat/shared";
import { existsSync, readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { z } from "zod";
import type { AuthProvider } from "./auth-provider";
import type { TextVectorizer } from "./text-vectorizer";
import type { TranslatableFileHandler } from "./translatable-file-handler";
import type {
  TranslationAdvisor,
  TranslationAdvisorOptions,
} from "./translation-advisor";
import type { PrismaClient } from "@cat/db";

const pluginsDir = join(process.cwd(), "plugins");

export type PluginLoadOptions = {
  configs: {
    key: string;
    value: unknown;
  }[];
};

export type LoadPluginsOptions = {
  silent?: boolean;
  tags?: string[];
};

export type GetTranslationAdvisorsOptions = {
  userConfigs?: {
    key: string;
    value: unknown;
  }[];
};

export interface CatPlugin {
  onLoaded: (options: PluginLoadOptions) => Promise<void>;
  getTextVectorizers?: () => TextVectorizer[];
  getTranslatableFileHandlers?: () => TranslatableFileHandler[];
  getTranslationAdvisors?: (
    options?: GetTranslationAdvisorsOptions,
  ) => TranslationAdvisor[];
  getAuthProviders?: () => AuthProvider[];
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

    // 用全局配置做启动加载
    const configs = z
      .array(
        z.object({
          key: z.string(),
          value: z.json(),
        }),
      )
      .parse(
        await prisma.pluginConfig.findMany({
          where: {
            pluginId,
          },
          select: {
            key: true,
            value: true,
          },
        }),
      );

    await instance.onLoaded({ configs });
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
    options?: TranslationAdvisorOptions,
  ): Promise<TranslationAdvisor[]> {
    return (
      await Promise.all(
        Array.from(this.plugins.entries()).map(async ([id, plugin]) => {
          if (options && options.userId) {
            const userConfigs = (
              await prisma.pluginUserConfigInstance.findMany({
                where: {
                  creatorId: options.userId,
                  Config: {
                    pluginId: id,
                  },
                  isActive: true,
                },
                select: {
                  value: true,
                  Config: {
                    select: {
                      key: true,
                    },
                  },
                },
              })
            ).map((result) => ({
              key: result.Config.key,
              value: result.value,
            }));
            return plugin.getTranslationAdvisors?.({ userConfigs });
          } else return plugin.getTranslationAdvisors?.();
        }),
      )
    )
      .filter(
        (advisors): advisors is TranslationAdvisor[] => advisors !== undefined,
      )
      .flat();
  }

  public async hasTranslationAdvisor(
    prisma: PrismaClient,
    id: string | null,
  ): Promise<boolean> {
    if (!id) return false;
    return !!(await this.getTranslationAdvisors(prisma)).find(
      (advisor) => advisor.getId() === id,
    );
  }

  public async getTranslationAdvisor(
    prisma: PrismaClient,
    id: string | null,
    options?: TranslationAdvisorOptions,
  ): Promise<TranslationAdvisor | null> {
    if (!id) return null;
    return (
      (await this.getTranslationAdvisors(prisma, options)).find(
        (advisor) => advisor.getId() === id,
      ) ?? null
    );
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

  public hasTextVectorizer(id: string | null): boolean {
    if (!id) return false;
    return !!this.getTextVectorizers().find(
      (vectorizer) => vectorizer.getId() === id,
    );
  }

  public getTextVectorizer(id: string | null): TextVectorizer | null {
    if (!id) return null;
    return (
      this.getTextVectorizers().find((advisor) => advisor.getId() === id) ??
      null
    );
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

  public hasTranslatableFileHandler(id: string | null): boolean {
    if (!id) return false;
    return !!this.getTranslatableFileHandlers().find(
      (handler) => handler.getId() === id,
    );
  }

  public getTranslatableFileHandler(
    id: string | null,
  ): TranslatableFileHandler | null {
    if (!id) return null;
    return (
      this.getTranslatableFileHandlers().find(
        (handler) => handler.getId() === id,
      ) ?? null
    );
  }

  public getAuthProviders(): AuthProvider[] {
    return Array.from(this.plugins.values())
      .map((plugin) => plugin.getAuthProviders?.())
      .filter((handlers): handlers is AuthProvider[] => handlers !== undefined)
      .flat();
  }

  public hasAuthProvider(id: string | null): boolean {
    if (!id) return false;
    return !!this.getAuthProviders().find(
      (provider) => provider.getId() === id,
    );
  }

  public getAuthProvider(id: string | null): AuthProvider | null {
    if (!id) return null;
    return (
      this.getAuthProviders().find((provider) => provider.getId() === id) ??
      null
    );
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
