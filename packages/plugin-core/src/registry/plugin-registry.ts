import { access, mkdir, readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import {
  _JSONSchemaSchema,
  JSONSchemaSchema,
  type JSONType,
} from "@cat/shared/schema/json";
import {
  getDefaultFromSchema,
  assertFirstNonNullish,
  assertSingleNonNullish,
  logger,
} from "@cat/shared/utils";
import {
  PluginDataSchema,
  PluginManifestSchema,
} from "@cat/shared/schema/plugin";
import type { PluginData, PluginManifest } from "@cat/shared/schema/plugin";
import {
  eq,
  inArray,
  OverallDrizzleClient,
  plugin,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  pluginService,
  type DrizzleClient,
  type PluginServiceType,
  type ScopeType,
} from "@cat/db";
import { and } from "@cat/db";
import { getPluginConfig } from "@/utils/config.ts";
import type { TranslationAdvisor } from "@/services/translation-advisor.ts";
import type { TranslatableFileHandler } from "@/services/translatable-file-handler.ts";
import type { TextVectorizer } from "@/services/text-vectorizer.ts";
import type { TermService } from "@/services/term-service.ts";
import type { StorageProvider } from "@/services/storage-provider.ts";
import type { AuthProvider } from "@/services/auth-provider.ts";
import { existsSync } from "node:fs";
import { IVectorStorage } from "@/services/vector-storage";

export type PluginServiceGetters = keyof Pick<
  CatPlugin,
  | "getAuthProviders"
  | "getStorageProviders"
  | "getTermServices"
  | "getTranslatableFileHandlers"
  | "getTranslationAdvisors"
  | "getTextVectorizers"
  | "getVectorStorages"
>;

type PluginServiceMap = {
  ["AUTH_PROVIDER"]: AuthProvider;
  ["STORAGE_PROVIDER"]: StorageProvider;
  ["TEXT_VECTORIZER"]: TextVectorizer;
  ["TRANSLATABLE_FILE_HANDLER"]: TranslatableFileHandler;
  ["TRANSLATION_ADVISOR"]: TranslationAdvisor;
  ["TERM_SERVICE"]: TermService;
  ["VECTOR_STORAGE"]: IVectorStorage;
};

const PluginServiceGetterMap: {
  [K in PluginServiceType]: PluginServiceGetters;
} = {
  ["AUTH_PROVIDER"]: "getAuthProviders",
  ["STORAGE_PROVIDER"]: "getStorageProviders",
  ["TEXT_VECTORIZER"]: "getTextVectorizers",
  ["TRANSLATABLE_FILE_HANDLER"]: "getTranslatableFileHandlers",
  ["TRANSLATION_ADVISOR"]: "getTranslationAdvisors",
  ["TERM_SERVICE"]: "getTermServices",
  ["VECTOR_STORAGE"]: "getVectorStorages",
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
  onEnabled?: () => Promise<void>;
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
  getVectorStorages?: (options: PluginGetterOptions) => IVectorStorage[];
}

const PluginObjectSchema = z.custom<CatPlugin>();

interface IPluginRegistry {
  installPlugin(drizzle: DrizzleClient, pluginId: string): Promise<void>;
  uninstallPlugin(drizzle: DrizzleClient, pluginId: string): Promise<void>;
  getPluginServices<T extends PluginServiceType>(
    drizzle: DrizzleClient,
    type: T,
  ): Promise<{ id: number; service: PluginServiceMap[T]; pluginId: string }[]>;
  getPluginService<T extends PluginServiceType>(
    drizzle: DrizzleClient,
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
    public readonly instancesCache = new Map<string, CatPlugin>(),
    // type -> pluginId
    public readonly serviceCache = new Map<
      PluginServiceType,
      Map<
        string,
        {
          id: number;
          service: IPluginService;
        }
      >
    >(),
  ) {}

  public static get(scopeType: ScopeType, scopeId: string): PluginRegistry {
    const key = `__PLUGIN_REGISTRY_${scopeType}_${scopeId}__`;
    // @ts-expect-error hard to declare type for globalThis
    if (!globalThis[key])
      // @ts-expect-error hard to declare type for globalThis
      globalThis[key] = new PluginRegistry(scopeType, scopeId);
    // @ts-expect-error hard to declare type for globalThis oxlint-disable-next-line no-unsafe-type-assertion
    // oxlint-disable no-unsafe-type-assertion
    return globalThis[key] as PluginRegistry;
  }

  public static async importPlugin(
    drizzle: OverallDrizzleClient,
    pluginId: string,
  ): Promise<void> {
    const data = await this.getPluginData(pluginId);

    await drizzle.transaction(async (tx) => {
      await tx
        .insert(plugin)
        .values([
          {
            id: pluginId,
            version: data.version,
            name: data.name,
            entry: data.entry ?? null,
            overview: data.overview,
            iconUrl: data.iconURL,
          },
        ])
        .onConflictDoUpdate({
          target: plugin.id,
          set: {
            name: data.name,
            version: data.version,
            entry: data.entry ?? null,
            overview: data.overview,
            iconUrl: data.iconURL,
          },
        });

      if (data.config) {
        const schema = _JSONSchemaSchema.parse(data.config);

        await tx
          .insert(pluginConfig)
          .values([{ pluginId, schema }])
          .onConflictDoUpdate({
            target: [pluginConfig.pluginId],
            set: { schema },
          });
      }
    });
  }

  public async installPlugin(
    drizzle: DrizzleClient,
    pluginId: string,
  ): Promise<void> {
    const manifest = await PluginRegistry.getPluginManifest(pluginId);

    logger.info("PLUGIN", {
      msg: `About to install plugin ${pluginId} in ${this.scopeType} ${this.scopeId}`,
    });

    const pluginObj = await this.getPluginInstance(pluginId);
    if (pluginObj.onInstalled) await pluginObj.onInstalled();

    await drizzle.transaction(async (tx) => {
      const installation = assertSingleNonNullish(
        await tx
          .insert(pluginInstallation)
          .values([
            { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
          ])
          .returning({ id: pluginInstallation.id }),
      );

      const pluginConfigs = await drizzle.query.pluginConfig.findMany({
        where: (config, { eq }) => eq(config.pluginId, pluginId),
        columns: { id: true, schema: true },
      });

      if (pluginConfigs.length > 0)
        await tx.insert(pluginConfigInstance).values(
          pluginConfigs.map((config) => ({
            configId: config.id,
            pluginInstallationId: installation.id,
            value:
              getDefaultFromSchema(JSONSchemaSchema.parse(config.schema)) ?? {},
          })),
        );

      // 以插件声明而不是实现的服务为准
      if (manifest.services && manifest.services.length > 0)
        await tx.insert(pluginService).values(
          manifest.services.map((service) => ({
            serviceId: service.id,
            serviceType: service.type,
            pluginInstallationId: installation.id,
          })),
        );
    });
  }

  public async uninstallPlugin(
    drizzle: DrizzleClient,
    pluginId: string,
  ): Promise<void> {
    const dbPlugin = await drizzle.query.plugin.findFirst({
      where: ({ id }, { eq }) => eq(id, pluginId),
    });

    if (!dbPlugin) throw new Error(`Plugin ${pluginId} not found`);

    const installation = await drizzle.query.pluginInstallation.findFirst({
      where: (installation, { and, eq }) =>
        and(
          eq(installation.pluginId, pluginId),
          eq(installation.scopeId, this.scopeId),
          eq(installation.scopeType, this.scopeType),
        ),
    });

    if (!installation) throw new Error(`Plugin ${pluginId} not installed`);

    await drizzle
      .delete(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.id, installation.id),
          eq(pluginInstallation.scopeId, this.scopeId),
          eq(pluginInstallation.scopeType, this.scopeType),
        ),
      );
  }

  public async getPluginServices<T extends PluginServiceType>(
    drizzle: OverallDrizzleClient,
    type: T,
  ): Promise<{ id: number; service: PluginServiceMap[T]; pluginId: string }[]> {
    // 优先考虑缓存
    if (this.serviceCache.has(type)) {
      // oxlint-disable-next-line no-unsafe-type-assertion
      return Array.from(this.serviceCache.get(type)!.values()) as {
        id: number;
        service: PluginServiceMap[T];
        pluginId: string;
      }[];
    }

    // 本 scope 的所有插件安装
    const installations = await drizzle.query.pluginInstallation.findMany({
      where: (installation, { and, eq }) =>
        and(
          eq(installation.scopeType, this.scopeType),
          eq(installation.scopeId, this.scopeId),
        ),
    });

    // 本 scope 注册的所有指定类型的服务
    const servicesRows = await drizzle
      .select({
        id: pluginService.id,
        serviceId: pluginService.serviceId,
        pluginId: plugin.id,
      })
      .from(pluginService)
      .innerJoin(
        pluginInstallation,
        eq(pluginService.pluginInstallationId, pluginInstallation.id),
      )
      .innerJoin(plugin, eq(pluginInstallation.pluginId, plugin.id))
      .where(
        and(
          inArray(
            pluginService.pluginInstallationId,
            installations.map((i) => i.id),
          ),
          eq(pluginService.serviceType, type),
        ),
      );

    const services: {
      id: number;
      service: PluginServiceMap[T];
      pluginId: string;
    }[] = [];

    await Promise.all(
      servicesRows.map(async (row) => {
        const service = await this.getPluginService(
          drizzle,
          row.pluginId,
          type,
          row.serviceId,
        );
        if (!service)
          throw new Error(
            `Plugin ${row.pluginId} declare service '${type}:${row.serviceId}' but not provided it in getter`,
          );

        const result = {
          id: row.id,
          service: service.service,
          pluginId: row.pluginId,
        };

        this.cacheService(type, result.pluginId, result);

        services.push(result);
      }),
    );

    return services;
  }

  public async getPluginService<T extends PluginServiceType>(
    drizzle: OverallDrizzleClient,
    pluginId: string,
    type: T,
    id: string,
  ): Promise<{ id: number; service: PluginServiceMap[T] } | null> {
    // 缓存
    if (this.serviceCache.has(type)) {
      const cached = this.serviceCache.get(type)!.get(pluginId);
      if (cached)
        return {
          id: cached.id,
          // oxlint-disable-next-line no-unsafe-type-assertion
          service: cached.service as PluginServiceMap[T],
        };
    }

    const installation = await drizzle.query.pluginInstallation.findFirst({
      where: (installation, { and, eq }) =>
        and(
          eq(installation.pluginId, pluginId),
          eq(installation.scopeType, this.scopeType),
          eq(installation.scopeId, this.scopeId),
        ),
      columns: {
        id: true,
      },
    });

    if (!installation) throw new Error("Plugin not installed");

    const service = assertFirstNonNullish(
      await drizzle
        .select({
          id: pluginService.id,
        })
        .from(pluginService)
        .innerJoin(
          pluginInstallation,
          eq(pluginService.pluginInstallationId, pluginInstallation.id),
        )
        .innerJoin(plugin, eq(pluginInstallation.pluginId, plugin.id))
        .where(
          and(
            eq(pluginService.pluginInstallationId, installation.id),
            eq(pluginService.serviceType, type),
          ),
        )
        .limit(1),
    );

    if (!service) throw new Error(`Service ${type} ${id} not found`);

    return this.getPluginServiceWithDBId(drizzle, service.id);
  }

  public async getPluginServiceWithDBId<T extends PluginServiceType>(
    drizzle: OverallDrizzleClient,
    id: number,
  ): Promise<{ id: number; service: PluginServiceMap[T] } | null> {
    const service = assertFirstNonNullish(
      await drizzle
        .select({
          id: pluginService.id,
          serviceId: pluginService.serviceId,
          type: pluginService.serviceType,
          pluginId: plugin.id,
        })
        .from(pluginService)
        .innerJoin(
          pluginInstallation,
          eq(pluginInstallation.id, pluginService.pluginInstallationId),
        )
        .innerJoin(plugin, eq(plugin.id, pluginInstallation.pluginId))
        .where(and(eq(pluginService.id, id)))
        .limit(1),
    );

    if (!service) throw new Error(`Service ${id} not found`);

    const instance = await this.getPluginInstance(service.pluginId);

    // oxlint-disable-next-line no-unsafe-type-assertion
    const getter = instance[PluginServiceGetterMap[service.type]] as
      | ((
          opts: PluginGetterOptions,
        ) => PluginServiceMap[T][] | PluginServiceMap[T])
      | undefined;

    if (!getter) return null;

    const config = await getPluginConfig(
      drizzle,
      service.pluginId,
      this.scopeType,
      this.scopeId,
    );

    const result = getter.call(instance, { config });
    const returned = Array.isArray(result) ? result : [result];

    const matched = returned.find((svc) => {
      const sid = svc.getId();
      return sid === service.serviceId;
    });

    if (!matched) return null;

    const r = { id: service.id, service: matched };

    this.cacheService(service.type, service.pluginId, r);

    return r;
  }

  private async getPluginInstance(pluginId: string): Promise<CatPlugin> {
    if (this.instancesCache.has(pluginId)) {
      return this.instancesCache.get(pluginId)!;
    }

    const pluginFsPath = await PluginRegistry.getPluginEntryFsPath(pluginId);
    // Vite build will sometimes remove inline /* @vite-ignore */ comments
    // and cause runtime warning
    const pluginUrl = /* @vite-ignore */ pathToFileURL(pluginFsPath).href;
    const imported = await import(/* @vite-ignore */ pluginUrl);

    if (
      !imported ||
      typeof imported !== "object" ||
      // oxlint-disable-next-line no-unsafe-member-access
      typeof imported.default !== "object"
    ) {
      throw new Error(
        `Plugin ${pluginId} does not have a default export object`,
      );
    }

    // oxlint-disable-next-line no-unsafe-member-access
    const instance = PluginObjectSchema.parse(imported.default);

    try {
      if (instance.onEnabled) await instance.onEnabled();
    } catch (err) {
      logger.error(
        "PLUGIN",
        {
          msg: `Error when running plugin '${pluginId}''s 'onEnabled hook' hook`,
        },
        err,
      );
    }

    this.instancesCache.set(pluginId, instance);

    return instance;
  }

  public static async getPluginEntryFsPath(id: string): Promise<string> {
    const manifest = await PluginRegistry.getPluginManifest(id);
    return join(PluginRegistry.getPluginFsPath(id), manifest.entry);
  }

  public static getPluginFsPath(id: string): string {
    return join(PluginRegistry.pluginsDir, id);
  }

  public static async getPluginManifest(
    pluginId: string,
  ): Promise<PluginManifest> {
    const dirPath = PluginRegistry.getPluginFsPath(pluginId);
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
  }

  public static async getPluginData(pluginId: string): Promise<PluginData> {
    const dir = PluginRegistry.getPluginFsPath(pluginId);

    const manifestPath = join(dir, "manifest.json");
    const packageDotJsonPath = join(dir, "package.json");
    const readmePath = join(dir, "README.md");

    const rawManifest = await readFile(manifestPath, "utf-8");
    const rawREADME = await readFile(readmePath, "utf-8").catch(() => null);

    const manifest = PluginManifestSchema.parse(JSON.parse(rawManifest));

    const { name, version } = z
      .object({
        name: z.string(),
        version: z.string(),
      })
      .parse(JSON.parse(await readFile(packageDotJsonPath, "utf-8")));

    return PluginDataSchema.parse({
      ...manifest,
      name,
      version,
      overview: rawREADME,
    });
  }

  public static async getPluginIdInLocalPlugins(): Promise<string[]> {
    if (!existsSync(PluginRegistry.pluginsDir))
      await mkdir(PluginRegistry.pluginsDir);

    const dirs = (
      await readdir(PluginRegistry.pluginsDir, {
        withFileTypes: true,
      })
    ).filter((dirent) => dirent.isDirectory());

    const results: string[] = [];

    await Promise.all(
      dirs.map(async (dir) => {
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
      }),
    );

    return results;
  }

  private cacheService(
    type: PluginServiceType,
    pluginId: string,
    service: {
      id: number;
      service: IPluginService;
    },
  ) {
    const current =
      this.serviceCache.get(type) ??
      new Map<
        string,
        {
          id: number;
          service: IPluginService;
        }
      >();
    current.set(pluginId, service);
    this.serviceCache.set(type, current);
  }

  public reload(): void {
    this.instancesCache.clear();
    this.serviceCache.clear();
  }
}
