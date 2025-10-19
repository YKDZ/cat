import { access, mkdir, readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import { JSONSchemaSchema, type JSONType } from "@cat/shared/schema/json";
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
import type { TranslationAdvisor } from "@/registry/translation-advisor.ts";
import type { TranslatableFileHandler } from "@/registry/translatable-file-handler.ts";
import type { TextVectorizer } from "@/registry/text-vectorizer.ts";
import type { TermService } from "@/registry/term-service.ts";
import type { StorageProvider } from "@/registry/storage-provider.ts";
import type { AuthProvider } from "@/registry/auth-provider.ts";
import { existsSync } from "node:fs";

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
  ["AUTH_PROVIDER"]: AuthProvider;
  ["STORAGE_PROVIDER"]: StorageProvider;
  ["TEXT_VECTORIZER"]: TextVectorizer;
  ["TRANSLATABLE_FILE_HANDLER"]: TranslatableFileHandler;
  ["TRANSLATION_ADVISOR"]: TranslationAdvisor;
  ["TERM_SERVICE"]: TermService;
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
            entry: data.entry ?? null,
            overview: data.overview,
            iconUrl: data.iconURL,
          },
        });

      if (data.config) {
        const schema = JSONSchemaSchema.parse(data.config);

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
    const dbPlugin = await drizzle.query.plugin.findFirst({
      where: (plugin, { eq }) => eq(plugin.id, pluginId),
      columns: {
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
    const installations = await drizzle.query.pluginInstallation.findMany({
      where: (installation, { and, eq }) =>
        and(
          eq(installation.scopeType, this.scopeType),
          eq(installation.scopeId, this.scopeId),
        ),
    });

    const servicesRows = await drizzle
      .select({
        id: pluginService.id,
        serviceId: pluginService.serviceId,
        plugin: {
          id: plugin.id,
          entry: plugin.entry,
        },
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

    const pluginMap = new Map<
      string,
      { entry: string; rows: { id: number; serviceId: string }[] }
    >();

    for (const r of servicesRows) {
      const plugin = r.plugin;
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
            drizzle,
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
    drizzle: OverallDrizzleClient,
    pluginId: string,
    type: T,
    id: string,
  ): Promise<{ id: number; service: PluginServiceMap[T] } | null> {
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
          serviceId: pluginService.serviceId,
          plugin: {
            id: plugin.id,
            entry: plugin.entry,
          },
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

    const entry = service.plugin.entry;
    const instance = await this.getPluginInstance(pluginId, entry);

    const getter = instance[PluginServiceGetterMap[type]] as
      | ((
          opts: PluginGetterOptions,
        ) => PluginServiceMap[T][] | PluginServiceMap[T])
      | undefined;

    if (!getter) return null;

    const config = await getPluginConfig(
      drizzle,
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

    return { id: service.id, service: matched };
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

    if (!access(manifestPath)) {
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
}
