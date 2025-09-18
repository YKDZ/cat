import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import { JSONSchemaSchema, type JSONType } from "@cat/shared/schema/json";
import {
  OverallPrismaClient,
  PluginServiceType,
  PrismaClient,
  ScopeType,
} from "@cat/db";
import { getDefaultFromSchema, logger } from "@cat/shared/utils";
import {
  PluginDataSchema,
  PluginManifestSchema,
} from "@cat/shared/schema/plugin";
import type { PluginData, PluginManifest } from "@cat/shared/schema/plugin";
import { getPluginConfig } from "@/utils/config.ts";
import type { TranslationAdvisor } from "@/registry/translation-advisor.ts";
import type { TranslatableFileHandler } from "@/registry/translatable-file-handler.ts";
import type { TextVectorizer } from "@/registry/text-vectorizer.ts";
import type { TermService } from "@/registry/term-service.ts";
import type { StorageProvider } from "@/registry/storage-provider.ts";
import type { AuthProvider } from "@/registry/auth-provider.ts";

export type PluginServiceGetters = keyof Pick<
  CatPlugin,
  | "getAuthProviders"
  | "getStorageProviders"
  | "getTermServices"
  | "getTranslatableFileHandlers"
  | "getTranslationAdvisors"
  | "getTextVectorizers"
>;

type PluginServiceMap = {
  [PluginServiceType.AUTH_PROVIDER]: AuthProvider;
  [PluginServiceType.STORAGE_PROVIDER]: StorageProvider;
  [PluginServiceType.TEXT_VECTORIZER]: TextVectorizer;
  [PluginServiceType.TRANSLATABLE_FILE_HANDLER]: TranslatableFileHandler;
  [PluginServiceType.TRANSLATION_ADVISOR]: TranslationAdvisor;
  [PluginServiceType.TERM_SERVICE]: TermService;
};

const PluginServiceGetterMap: {
  [K in PluginServiceType]: PluginServiceGetters;
} = {
  [PluginServiceType.AUTH_PROVIDER]: "getAuthProviders",
  [PluginServiceType.STORAGE_PROVIDER]: "getStorageProviders",
  [PluginServiceType.TEXT_VECTORIZER]: "getTextVectorizers",
  [PluginServiceType.TRANSLATABLE_FILE_HANDLER]: "getTranslatableFileHandlers",
  [PluginServiceType.TRANSLATION_ADVISOR]: "getTranslationAdvisors",
  [PluginServiceType.TERM_SERVICE]: "getTermServices",
};

export interface IPluginService {
  getId(): string;
}

export type LoadPluginsOptions = {
  ids?: string[];
};

export type PluginGetterOptions = {
  config?: JSONType;
};

export type GetterOptions = {
  scopeType: ScopeType;
  scopeId: string;
};

export interface CatPlugin {
  onInstalled?: () => Promise<void>;
  onUninstalled?: () => Promise<void>;
  onLoaded?: () => Promise<void>;
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

interface IPluginRegistry {
  installPlugin(prisma: PrismaClient, pluginId: string): Promise<void>;
  uninstallPlugin(prisma: PrismaClient, pluginId: string): Promise<void>;
  getPluginServices<T extends PluginServiceType>(
    prisma: OverallPrismaClient,
    type: T,
  ): Promise<{ id: number; service: PluginServiceMap[T]; pluginId: string }[]>;
  getPluginService<T extends PluginServiceType>(
    prisma: OverallPrismaClient,
    pluginId: string,
    type: T,
    id: string,
  ): Promise<{ id: number; service: PluginServiceMap[T] } | null>;
}

export class PluginRegistry implements IPluginRegistry {
  public static readonly pluginsDir: string = join(process.cwd(), "plugins");

  public constructor(
    public readonly scopeType: ScopeType,
    public readonly scopeId: string,
  ) {}

  public static get(scopeType: ScopeType, scopeId: string): PluginRegistry {
    const key = `__PLUGIN_REGISTRY_${scopeType}_${scopeId}__`;
    // @ts-expect-error hard to declare type for globalThis
    if (!globalThis[key])
      // @ts-expect-error hard to declare type for globalThis
      globalThis[key] = new PluginRegistry(scopeType, scopeId);
    // @ts-expect-error hard to declare type for globalThis
    return globalThis[key];
  }

  public static async importPlugin(
    prisma: OverallPrismaClient,
    pluginId: string,
  ): Promise<void> {
    const data = await this.getPluginData(pluginId);

    await prisma.plugin.upsert({
      where: {
        id: pluginId,
      },
      update: {
        name: data.name,
        entry: data.entry,
        overview: data.overview,
        iconURL: data.iconURL,

        Config: data.config
          ? {
              connectOrCreate: {
                where: {
                  pluginId,
                  schema: {
                    equals: z.json().parse(data.config) ?? {},
                  },
                },
                create: {
                  schema: z.json().parse(data.config) ?? {},
                },
              },
            }
          : undefined,

        Tags: {
          connectOrCreate: data.tags
            ? data.tags.map((tag) => ({
                where: {
                  name: tag,
                },
                create: {
                  name: tag,
                },
              }))
            : undefined,
        },

        Versions: {
          connectOrCreate: {
            where: {
              pluginId_version: {
                pluginId,
                version: data.version,
              },
            },
            create: {
              version: data.version,
            },
          },
        },
      },

      create: {
        id: pluginId,
        name: data.name,
        overview: data.overview,
        entry: data.entry ?? null,
        iconURL: data.iconURL,

        Config: data.config
          ? {
              create: {
                schema: z.json().parse(data.config) ?? {},
              },
            }
          : undefined,

        Tags: {
          connectOrCreate: data.tags
            ? data.tags.map((tag) => ({
                where: {
                  name: tag,
                },
                create: {
                  name: tag,
                },
              }))
            : undefined,
        },

        Versions: {
          create: {
            version: data.version,
          },
        },
      },
    });
  }

  public async installPlugin(prisma: PrismaClient, pluginId: string) {
    const dbPlugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
      select: {
        entry: true,
      },
    });

    if (!dbPlugin) throw new Error(`Plugin ${pluginId} not found`);

    const manifest = await PluginRegistry.getPluginManifest(pluginId);

    logger.info("PLUGIN", {
      msg: `About to install plugin ${pluginId} in ${this.scopeType} ${this.scopeId}`,
    });

    const pluginObj = await this.getPluginInstance(pluginId, dbPlugin.entry);
    if (pluginObj.onInstalled) await pluginObj.onInstalled();

    await prisma.$transaction(async (tx) => {
      const installation = await tx.pluginInstallation.create({
        data: { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
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

      for (const { id: serviceId, type: serviceType } of manifest.services ??
        []) {
        await tx.pluginService.create({
          data: {
            serviceId,
            serviceType,
            pluginInstallationId: installation.id,
          },
        });
      }
    });
  }

  public async uninstallPlugin(prisma: PrismaClient, pluginId: string) {
    const dbPlugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!dbPlugin) throw new Error(`Plugin ${pluginId} not found`);

    const installation = await prisma.pluginInstallation.findUnique({
      where: {
        scopeId_scopeType_pluginId: {
          pluginId,
          scopeType: this.scopeType,
          scopeId: this.scopeId,
        },
      },
    });

    if (!installation) throw new Error(`Plugin ${pluginId} not installed`);

    await prisma.pluginInstallation.delete({
      where: {
        scopeId_scopeType_pluginId: {
          pluginId,
          scopeType: this.scopeType,
          scopeId: this.scopeId,
        },
      },
    });
  }

  public async getPluginServices<T extends PluginServiceType>(
    prisma: OverallPrismaClient,
    type: T,
  ): Promise<{ id: number; service: PluginServiceMap[T]; pluginId: string }[]> {
    const installations = await prisma.pluginInstallation.findMany({
      where: {
        scopeId: this.scopeId,
        scopeType: this.scopeType,
      },
    });

    const servicesRows = await prisma.pluginService.findMany({
      where: {
        pluginInstallationId: {
          in: installations.map((i) => i.id),
        },
        serviceType: type,
      },
      select: {
        id: true,
        serviceId: true,
        PluginInstallation: {
          select: {
            Plugin: {
              select: {
                id: true,
                entry: true,
              },
            },
          },
        },
      },
    });

    // Map: pluginId -> { entry, rows: [{ id, serviceId }] }
    const pluginMap = new Map<
      string,
      { entry: string; rows: { id: number; serviceId: string }[] }
    >();

    for (const r of servicesRows) {
      const plugin = r.PluginInstallation?.Plugin;
      if (!plugin?.id) continue;
      const pluginId = plugin.id;
      const entry = plugin.entry;
      const existing = pluginMap.get(pluginId);
      if (!existing) {
        pluginMap.set(pluginId, {
          entry,
          rows: [{ id: r.id, serviceId: r.serviceId }],
        });
      } else {
        existing.rows.push({ id: r.id, serviceId: r.serviceId });
      }
    }

    const arrays = await Promise.all(
      Array.from(pluginMap.entries()).map(
        async ([pluginId, { entry, rows }]) => {
          const instance = await this.getPluginInstance(pluginId, entry);

          const methodName = PluginServiceGetterMap[type];

          const getter = instance[methodName] as
            | ((
                opts: PluginGetterOptions,
              ) => PluginServiceMap[T][] | PluginServiceMap[T])
            | undefined;

          if (!getter)
            return [] as {
              id: number;
              service: PluginServiceMap[T];
              pluginId: string;
            }[];

          const config = await getPluginConfig(
            prisma,
            pluginId,
            this.scopeType,
            this.scopeId,
          );

          const result = getter.call(instance, { config });
          const returnedServices = Array.isArray(result) ? result : [result];

          // For each returned service, find matching DB row by serviceId (service.getId())
          const mapped = returnedServices
            .map((service) => {
              const sid = service.getId() as string | undefined;
              if (!sid) return null;
              const dbRow = rows.find((r) => r.serviceId === sid);
              if (!dbRow) return null; // 如果 DB 没有对应的 row，就不返回（因为无法提供 db id）
              return {
                id: dbRow.id,
                service,
                pluginId,
              } as {
                id: number;
                service: PluginServiceMap[T];
                pluginId: string;
              };
            })
            .filter(
              (
                x,
              ): x is {
                id: number;
                service: PluginServiceMap[T];
                pluginId: string;
              } => !!x,
            );

          return mapped;
        },
      ),
    );

    return arrays.flat();
  }

  public async getPluginService<T extends PluginServiceType>(
    prisma: OverallPrismaClient,
    pluginId: string,
    type: T,
    id: string,
  ): Promise<{ id: number; service: PluginServiceMap[T] } | null> {
    const installation = await prisma.pluginInstallation.findUnique({
      where: {
        scopeId_scopeType_pluginId: {
          pluginId,
          scopeType: this.scopeType,
          scopeId: this.scopeId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!installation) throw new Error("Plugin not installed");

    const serviceRow = await prisma.pluginService.findUnique({
      where: {
        serviceType_serviceId_pluginInstallationId: {
          serviceType: type,
          serviceId: id,
          pluginInstallationId: installation.id,
        },
      },
      select: {
        id: true,
        PluginInstallation: {
          select: {
            Plugin: {
              select: {
                entry: true,
              },
            },
          },
        },
      },
    });

    if (!serviceRow) throw new Error(`Service ${type} ${id} not found`);

    const entry = serviceRow.PluginInstallation.Plugin.entry;
    const instance = await this.getPluginInstance(pluginId, entry);

    const getter = instance[PluginServiceGetterMap[type]] as
      | ((
          opts: PluginGetterOptions,
        ) => PluginServiceMap[T][] | PluginServiceMap[T])
      | undefined;

    if (!getter) return null;

    const config = await getPluginConfig(
      prisma,
      pluginId,
      this.scopeType,
      this.scopeId,
    );

    const result = getter.call(instance, { config });
    const returned = Array.isArray(result) ? result : [result];

    const matched = returned.find((svc) => {
      const sid = svc.getId();
      return sid === id;
    });

    if (!matched) return null;

    return { id: serviceRow.id, service: matched };
  }

  private async getPluginInstance(pluginId: string, entry: string) {
    const pluginFsPath = PluginRegistry.getPluginEntryFsPath(pluginId, entry);
    // Vite build will sometimes remove inline /* @vite-ignore */ comments
    // and cause runtime warning
    const pluginUrl = /* @vite-ignore */ pathToFileURL(pluginFsPath).href;
    const imported = await import(/* @vite-ignore */ pluginUrl);

    const instance = PluginObjectSchema.parse(imported.default ?? imported);

    try {
      if (instance.onLoaded) await instance.onLoaded();
    } catch (err) {
      logger.error(
        "PLUGIN",
        {
          msg: `Error when running plugin '${pluginId}''s 'onLoaded' hook`,
        },
        err,
      );
    }

    return instance;
  }

  public static getPluginEntryFsPath(id: string, entry: string): string {
    return join(PluginRegistry.getPluginFsPath(id), entry);
  }

  public static getPluginFsPath(id: string): string {
    return join(PluginRegistry.pluginsDir, id);
  }

  public static async getPluginManifest(
    pluginId: string,
  ): Promise<PluginManifest> {
    const dirPath = PluginRegistry.getPluginFsPath(pluginId);
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

  public static async getPluginData(pluginId: string): Promise<PluginData> {
    const dir = PluginRegistry.getPluginFsPath(pluginId);

    const manifestPath = join(dir, "manifest.json");
    const packageDotJsonPath = join(dir, "package.json");
    const readmePath = join(dir, "README.md");

    const rawManifest = await readFile(manifestPath, "utf-8");
    const rawREADME = await readFile(readmePath, "utf-8").catch(() => null);

    const manifest = PluginManifestSchema.parse(JSON.parse(rawManifest));

    const { name, version } = JSON.parse(
      await readFile(packageDotJsonPath, "utf-8"),
    );

    return PluginDataSchema.parse({
      ...manifest,
      name,
      version,
      overview: rawREADME,
    });
  }

  public static async getPluginIdInLocalPlugins(): Promise<string[]> {
    const dirs = readdirSync(PluginRegistry.pluginsDir, {
      withFileTypes: true,
    }).filter((dirent) => dirent.isDirectory());

    const results = [];

    for (const dir of dirs) {
      try {
        const manifest = await PluginRegistry.getPluginManifest(dir.name);
        results.push(manifest.id);
      } catch (err) {
        logger.error(
          "PLUGIN",
          { msg: `Error reading manifest.json in ${dir.name}:` },
          err,
        );
      }
    }

    return results;
  }
}
