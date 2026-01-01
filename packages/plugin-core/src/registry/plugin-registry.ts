import { access, mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import * as z from "zod/v4";
import { Hono } from "hono";
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
  and,
  getColumns,
  plugin,
  pluginComponent,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  pluginService,
  type DrizzleClient,
  type DrizzleTransaction,
} from "@cat/db";

import type { TranslationAdvisor } from "@/services/translation-advisor.ts";
import type { TextVectorizer } from "@/services/text-vectorizer.ts";
import type { StorageProvider } from "@/services/storage-provider.ts";
import type { AuthProvider } from "@/services/auth-provider.ts";
import { VectorStorage } from "@/services/vector-storage";
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
import type { MFAProvider } from "@/services/mfa-provider";
import type { FileExporter, FileImporter } from "@/services/file-handler";

// Type Definitions
type PluginServiceTypeMap = {
  AUTH_PROVIDER: AuthProvider;
  MFA_PROVIDER: MFAProvider;
  STORAGE_PROVIDER: StorageProvider;
  TEXT_VECTORIZER: TextVectorizer;
  FILE_IMPORTER: FileImporter;
  FILE_EXPORTER: FileExporter;
  TRANSLATION_ADVISOR: TranslationAdvisor;
  TERM_EXTRACTOR: TermExtractor;
  TERM_RECOGNIZER: TermRecognizer;
  TERM_ALIGNER: TermAligner;
  QA_CHECKER: QAChecker;
  VECTOR_STORAGE: VectorStorage;
};

export type PluginServiceMap = {
  [K in PluginServiceType]: PluginServiceTypeMap[K];
};

const PluginObjectSchema = z.custom<CatPlugin>();

/**
 * 插件加载器接口
 * 用于抽象插件数据的获取来源（文件系统、内存、网络等）
 */
export interface PluginLoader {
  /**
   * 获取插件的 Manifest 信息
   */
  getManifest: (pluginId: string) => Promise<PluginManifest>;

  /**
   * 获取插件的完整数据（Manifest + README + Package info）
   * 通常用于导入数据库
   */
  getData: (pluginId: string) => Promise<PluginData>;

  /**
   * 获取插件的可执行实例（代码入口）
   */
  getInstance: (pluginId: string) => Promise<CatPlugin>;

  /**
   * 列出所有可用的插件 ID
   */
  listAvailablePlugins: () => Promise<string[]>;
}

/**
 * 默认的文件系统加载器实现
 */
export class FileSystemPluginLoader implements PluginLoader {
  private readonly pluginsDir: string;

  constructor(pluginsDir?: string) {
    this.pluginsDir = pluginsDir ?? join(process.cwd(), "plugins");
  }

  private getPluginFsPath = (id: string): string => {
    return join(this.pluginsDir, id);
  };

  private getPluginEntryFsPath = async (id: string): Promise<string> => {
    const manifest = await this.getManifest(id);
    return join(this.getPluginFsPath(id), manifest.entry);
  };

  public getManifest = async (pluginId: string): Promise<PluginManifest> => {
    const dirPath = this.getPluginFsPath(pluginId);
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
  };

  public getData = async (pluginId: string): Promise<PluginData> => {
    const dir = this.getPluginFsPath(pluginId);

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
  };

  public getInstance = async (pluginId: string): Promise<CatPlugin> => {
    const pluginFsPath = await this.getPluginEntryFsPath(pluginId);
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
  };

  public listAvailablePlugins = async (): Promise<string[]> => {
    if (!existsSync(this.pluginsDir)) await mkdir(this.pluginsDir);

    const dirs = (
      await readdir(this.pluginsDir, {
        withFileTypes: true,
      })
    ).filter((dirent) => dirent.isDirectory());

    const results: string[] = [];

    await Promise.all(
      dirs.map(async (dir) => {
        try {
          const manifest = await this.getManifest(dir.name);
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
  };
}

export class PluginRegistry {
  public constructor(
    public readonly scopeType: ScopeType,
    public readonly scopeId: string,
    private serviceRegistry: ServiceRegistry = new ServiceRegistry(),
    private componentRegistry: ComponentRegistry = new ComponentRegistry(),
    private loader: PluginLoader = new FileSystemPluginLoader(),
  ) {}

  /**
   *
   * @param scopeType
   * @param scopeId
   * @param loader 若不存在，用什么 loader 创建这个注册表
   * @returns
   */
  public static get(
    scopeType: ScopeType,
    scopeId: string,
    loader?: PluginLoader,
  ): PluginRegistry {
    const key = `__PLUGIN_REGISTRY_${scopeType}_${scopeId}__`;
    // @ts-expect-error hard to declare type for globalThis
    if (!globalThis[key])
      // @ts-expect-error hard to declare type for globalThis
      globalThis[key] = new PluginRegistry(
        scopeType,
        scopeId,
        undefined,
        undefined,
        loader,
      );
    // @ts-expect-error hard to declare type for globalThis oxlint-disable-next-line no-unsafe-type-assertion
    // oxlint-disable no-unsafe-type-assertion
    return globalThis[key] as PluginRegistry;
  }

  /**
   * 安装插件并将其 manifest 中声明的服务注册到数据库
   */
  public async installPlugin(
    drizzle: DrizzleClient,
    pluginId: string,
  ): Promise<void> {
    // 使用实例绑定的 loader
    const manifest = await this.loader.getManifest(pluginId);

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
    drizzle: DrizzleClient,
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

  public async enableAllPlugins(
    drizzle: DrizzleTransaction,
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
    drizzle: DrizzleTransaction,
    pluginId: string,
    app: Hono,
  ): Promise<void> {
    const pluginObj = await this.loader.getInstance(pluginId);

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

  /**
   * 扫描当前 Loader 可检测到的所有插件，将尚未入库的插件导入数据库
   */
  public async importAvailablePlugins(drizzle: DrizzleClient): Promise<void> {
    await drizzle.transaction(async (tx) => {
      // 1. 获取数据库中已存在的插件 ID
      const existPluginIds: string[] = (
        await tx
          .select({
            id: plugin.id,
          })
          .from(plugin)
      ).map((p) => p.id);

      // 2. 获取 Loader 能发现的所有插件 ID
      const availableIds = await this.loader.listAvailablePlugins();

      // 3. 过滤出新的插件 ID
      const newIds = availableIds.filter((id) => !existPluginIds.includes(id));

      // 4. 导入新插件
      await Promise.all(
        newIds.map(async (id) => {
          // 使用当前实例的 loader 进行导入
          await PluginRegistry.importPlugin(tx, id, this.loader);
        }),
      );
    });
  }

  /**
   * 将插件和其配置 schema 加载到数据库但不安装它
   * @param drizzle 数据库客户端
   * @param pluginId 插件 ID
   * @param loader 可选的加载器，如果不传则使用默认的文件系统加载器
   */
  private static async importPlugin(
    drizzle: DrizzleClient,
    pluginId: string,
    loader: PluginLoader = new FileSystemPluginLoader(),
  ): Promise<void> {
    const data = await loader.getData(pluginId);

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

  public async reload(drizzle: DrizzleTransaction, app: Hono): Promise<void> {
    await this.enableAllPlugins(drizzle, app);
  }

  public getLoader(): PluginLoader {
    return this.loader;
  }
}
