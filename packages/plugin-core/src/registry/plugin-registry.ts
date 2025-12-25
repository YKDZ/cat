import { access, mkdir, readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as z from "zod/v4";
import { _JSONSchemaSchema, JSONSchemaSchema } from "@cat/shared/schema/json";
import {
  getDefaultFromSchema,
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
  getColumns,
  OverallDrizzleClient,
  plugin,
  pluginComponent,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  pluginService,
  type DrizzleClient,
} from "@cat/db";
import { and } from "@cat/db";
import type { TranslationAdvisor } from "@/services/translation-advisor.ts";
import type { TranslatableFileHandler } from "@/services/translatable-file-handler.ts";
import type { TextVectorizer } from "@/services/text-vectorizer.ts";
import type { StorageProvider } from "@/services/storage-provider.ts";
import type { AuthProvider } from "@/services/auth-provider.ts";
import { existsSync } from "node:fs";
import { IVectorStorage } from "@/services/vector-storage";
import {
  ServiceRegistry,
  ServiceRegistryRecordSchema,
  type ServiceRegistryRecord,
} from "@/registry/service-registry";
import type {
  PluginServiceType,
  ScopeType,
} from "@cat/shared/schema/drizzle/enum";
import type {
  TermAligner,
  TermExtractor,
  TermRecognizer,
} from "@/services/term-services";
import type { QAChecker } from "@/services/qa";
import {
  ComponentRegistry,
  type ComponentRecord,
} from "@/registry/component-registry";
import type { CatPlugin } from "@/entities/plugin";
import { getPluginConfig } from "@/utils/config";
import { Hono } from "hono";
import type { MFAProvider } from "@/services/mfa-provider";

type PluginServiceTypeMap = {
  AUTH_PROVIDER: AuthProvider;
  MFA_PROVIDER: MFAProvider;
  STORAGE_PROVIDER: StorageProvider;
  TEXT_VECTORIZER: TextVectorizer;
  TRANSLATABLE_FILE_HANDLER: TranslatableFileHandler;
  TRANSLATION_ADVISOR: TranslationAdvisor;
  TERM_EXTRACTOR: TermExtractor;
  TERM_RECOGNIZER: TermRecognizer;
  TERM_ALIGNER: TermAligner;
  QA_CHECKER: QAChecker;
  VECTOR_STORAGE: IVectorStorage;
};

type PluginServiceMap = {
  [K in PluginServiceType]: PluginServiceTypeMap[K];
};

const PluginObjectSchema = z.custom<CatPlugin>();

export class PluginRegistry {
  public static readonly pluginsDir: string = join(process.cwd(), "plugins");

  public constructor(
    public readonly scopeType: ScopeType,
    public readonly scopeId: string,
    private serviceRegistry: ServiceRegistry = new ServiceRegistry(),
    private componentRegistry: ComponentRegistry = new ComponentRegistry(),
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

  /**
   * 将插件和其配置 schema 加载到数据库但不安装它
   * @param drizzle
   * @param pluginId
   */
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

  /**
   * 安装插件并将其 manifest 中声明的服务注册到数据库
   * @param drizzle
   * @param pluginId
   */
  public async installPlugin(
    drizzle: DrizzleClient,
    pluginId: string,
  ): Promise<void> {
    const manifest = await PluginRegistry.getPluginManifest(pluginId);

    logger.info("PLUGIN", {
      msg: `About to install plugin ${pluginId} in ${this.scopeType} ${this.scopeId}`,
    });

    await drizzle.transaction(async (tx) => {
      const installation = assertSingleNonNullish(
        await tx
          .insert(pluginInstallation)
          .values([
            { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
          ])
          .returning({ id: pluginInstallation.id }),
      );

      const pluginConfigs = await tx
        .select({
          id: pluginConfig.id,
          schema: pluginConfig.schema,
        })
        .from(pluginConfig)
        .where(eq(pluginConfig.pluginId, pluginId));

      if (pluginConfigs.length > 0)
        await tx.insert(pluginConfigInstance).values(
          pluginConfigs.map((config) => ({
            configId: config.id,
            pluginInstallationId: installation.id,
            value:
              getDefaultFromSchema(JSONSchemaSchema.parse(config.schema)) ?? {},
          })),
        );

      // TODO 真的有必要插入数据库吗
      if (manifest.components && manifest.components.length > 0) {
        await tx.insert(pluginComponent).values(
          manifest.components.map((component) => ({
            componentId: component.id,
            slot: component.slot,
            url: component.url,
            pluginInstallationId: installation.id,
          })),
        );
      }

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
    assertSingleNonNullish(
      await drizzle
        .select(getColumns(plugin))
        .from(plugin)
        .where(eq(plugin.id, pluginId)),
      `Plugin ${pluginId} not found`,
    );

    const installation = assertSingleNonNullish(
      await drizzle
        .select({
          id: pluginInstallation.id,
        })
        .from(pluginInstallation)
        .where(
          and(
            eq(pluginInstallation.pluginId, pluginId),
            eq(pluginInstallation.scopeId, this.scopeId),
            eq(pluginInstallation.scopeType, this.scopeType),
          ),
        ),
      `Plugin ${pluginId} not installed in scope ${this.scopeType}:${this.scopeId}`,
    );

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

  public getPluginService<T extends PluginServiceType>(
    pluginId: string,
    type: T,
    id: string,
  ): PluginServiceMap[T] | null {
    const record = ServiceRegistryRecordSchema.parse({
      pluginId,
      type,
      id,
    });

    if (!this.serviceRegistry.has(record))
      throw new Error(`Service ${id} not found`);

    // oxlint-disable-next-line no-unsafe-return
    return this.serviceRegistry.get(record) as unknown as PluginServiceMap[T];
  }

  public getPluginServices<T extends PluginServiceType>(
    type: T,
  ): {
    record: ServiceRegistryRecord;
    service: PluginServiceMap[T];
  }[] {
    return this.serviceRegistry
      .entries()
      .filter((entry) => entry.record.type === type)
      .map((entry) => ({
        record: entry.record,
        service: entry.service as PluginServiceMap[T],
      }));
  }

  public async getPluginServiceDbId(
    drizzle: OverallDrizzleClient,
    pluginId: string,
    serviceId: string,
  ): Promise<number> {
    const service = assertSingleNonNullish(
      await drizzle
        .select({
          id: pluginService.id,
        })
        .from(pluginInstallation)
        .innerJoin(
          pluginService,
          eq(pluginService.pluginInstallationId, pluginInstallation.id),
        )
        .where(
          and(
            eq(pluginInstallation.pluginId, pluginId),
            eq(pluginInstallation.scopeType, this.scopeType),
            eq(pluginInstallation.scopeId, this.scopeId),
            eq(pluginService.serviceId, serviceId),
          ),
        ),
      `Service ${pluginId}:${serviceId} not found`,
    );
    return service.id;
  }

  public getComponentOfSlot(slot: string): ComponentRecord[] {
    return this.componentRegistry.getSlot(slot);
  }

  public getComponents(pluginId: string): ComponentRecord[] {
    return this.componentRegistry.get(pluginId);
  }

  private async getPluginInstance(pluginId: string): Promise<CatPlugin> {
    const pluginFsPath = await PluginRegistry.getPluginEntryFsPath(pluginId);
    // Vite build will sometimes remove inline /* @vite-ignore */ comments
    // and cause runtime warning
    const pluginUrl = /* @vite-ignore */ pathToFileURL(pluginFsPath).href;
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

  public async enableAllPlugins(
    drizzle: OverallDrizzleClient,
    app: Hono,
  ): Promise<void> {
    const installations = await drizzle
      .select({
        pluginId: pluginInstallation.pluginId,
      })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.scopeType, this.scopeType),
          eq(pluginInstallation.scopeId, this.scopeId),
        ),
      );

    await Promise.all(
      installations.map(async ({ pluginId }) => {
        await this.enablePlugin(drizzle, pluginId, app);
      }),
    );
  }

  public async enablePlugin(
    drizzle: OverallDrizzleClient,
    pluginId: string,
    app: Hono,
  ): Promise<void> {
    const pluginObj = await this.getPluginInstance(pluginId);
    const config = await getPluginConfig(
      drizzle,
      pluginId,
      this.scopeType,
      this.scopeId,
    );

    const registeredServices = await drizzle
      .select({
        type: pluginService.serviceType,
        id: pluginService.serviceId,
        dbId: pluginService.id,
      })
      .from(pluginInstallation)
      .innerJoin(
        pluginService,
        eq(pluginService.pluginInstallationId, pluginInstallation.id),
      )
      .where(
        and(
          eq(pluginInstallation.scopeType, this.scopeType),
          eq(pluginInstallation.scopeId, this.scopeId),
          eq(pluginInstallation.pluginId, pluginId),
        ),
      );

    if (pluginObj.services) {
      const services = await pluginObj.services({
        config,
        services: registeredServices,
      });
      this.serviceRegistry.combine(pluginId, services);
    }

    if (pluginObj.components) {
      const components = await pluginObj.components({
        config,
        services: registeredServices,
      });
      this.componentRegistry.combine(
        pluginId,
        components.map((component) => ({ ...component, pluginId })),
      );
    }

    if (pluginObj.routes) {
      const route = new Hono();
      const baseURL = `/_plugin_route/${pluginId}`;

      await pluginObj.routes({ route, baseURL, services: registeredServices });

      app.route(baseURL, route);
    }
  }

  public async reload(drizzle: OverallDrizzleClient, app: Hono): Promise<void> {
    await this.enableAllPlugins(drizzle, app);
  }
}
