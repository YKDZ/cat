import type { DbHandle, DrizzleClient, DrizzleTransaction } from "@cat/domain";
import type {
  PluginServiceType,
  ScopeType,
} from "@cat/shared/schema/drizzle/enum";

import {
  checkServiceReferences,
  deletePluginServices,
  executeCommand,
  executeQuery,
  getPluginConfigInstanceByInstallation,
  getPluginInstallation,
  installPlugin,
  listInstalledPlugins,
  listPluginServices,
  listPluginServicesForInstallation,
  syncPluginServices,
  uninstallPlugin,
  updatePluginConfigInstanceValue,
} from "@cat/domain";
import {
  createPluginCapabilities,
  getCacheStore,
  getSessionStore,
  type PluginCapabilities,
} from "@cat/domain";
import { JSONSchemaSchema, type JSONObject } from "@cat/shared/schema/json";
import {
  getDefaultFromSchema,
  assertSingleNonNullish,
  logger,
} from "@cat/shared/utils";
import { Hono } from "hono";
import { readFile } from "node:fs/promises";

import type { CatPlugin, PluginContext } from "@/entities/plugin";
import type { IPluginService } from "@/services/service";
import type { PluginServiceMap } from "@/types/plugin";

import {
  ComponentRegistry,
  type ComponentRecord,
} from "@/registry/component-registry";
import { PluginRouteRegistry } from "@/registry/plugin-route-registry";
import {
  ServiceRegistry,
  type RegisteredService,
} from "@/registry/service-registry";
import { getPluginConfig } from "@/utils/config";

import { FileSystemPluginLoader, type PluginLoader } from "./loader";
import { PluginDiscoveryService } from "./plugin-discovery";

/**
 * 作用域插件管理器
 * 必须绑定到一个具体的 Scope
 * 负责管理该作用域下的插件生命周期：
 * Discovery → Registration → Installation → Activation → (ConfigReload) → Deactivation → Uninstallation
 */
export class PluginManager {
  private static readonly instances = new Map<string, PluginManager>();

  private activePlugins = new Map<string, CatPlugin>();
  private readonly routeRegistry = new PluginRouteRegistry();

  public constructor(
    public readonly scopeType: ScopeType,
    public readonly scopeId: string,
    private readonly loader: PluginLoader = new FileSystemPluginLoader(),
    private readonly discovery: PluginDiscoveryService = PluginDiscoveryService.getInstance(
      loader,
    ),
    private readonly serviceRegistry: ServiceRegistry = new ServiceRegistry(),
    private readonly componentRegistry: ComponentRegistry = new ComponentRegistry(),
  ) {
    this.discovery = PluginDiscoveryService.getInstance(loader);
  }

  private createCapabilities = (drizzle: DbHandle): PluginCapabilities => {
    return createPluginCapabilities({
      db: drizzle,
    });
  };

  /**
   * 获取或创建特定作用域的管理器实例
   * 使用类型安全的 Map 缓存替代 globalThis
   */
  public static get(
    scopeType: ScopeType,
    scopeId: string,
    loader?: PluginLoader,
  ): PluginManager {
    const key = `${scopeType}:${scopeId}`;
    let instance = PluginManager.instances.get(key);
    if (!instance) {
      instance = new PluginManager(scopeType, scopeId, loader);
      PluginManager.instances.set(key, instance);
    }
    return instance;
  }

  public static clear(): void {
    PluginManager.instances.clear();
  }

  /**
   * 安装默认插件
   * 从配置文件读取默认插件列表，安装尚未安装的插件
   */
  public static async installDefaults(
    drizzle: DrizzleClient,
    manager: PluginManager,
    defaultPluginsPath: string,
  ): Promise<void> {
    const parsed: unknown = JSON.parse(
      await readFile(defaultPluginsPath, "utf-8"),
    );
    const pluginIds: string[] = Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];

    const installed = new Set(
      (
        await executeQuery({ db: drizzle }, listInstalledPlugins, {
          scopeType: manager.scopeType,
          scopeId: manager.scopeId,
        })
      ).map((i) => i.pluginId),
    );

    const toInstall = pluginIds.filter((id) => !installed.has(id));

    await Promise.all(
      toInstall.map(async (id) => manager.install(drizzle, id)),
    );
  }

  // ────────────────────────────────────────────
  //  公共生命周期 API
  // ────────────────────────────────────────────

  /**
   * 安装插件到当前 scope
   * 只创建 Installation + ConfigInstance，不写入 services/components
   * services/components 的 DB 同步集中在 activate() 中
   */
  public async install(
    drizzle: DrizzleClient,
    pluginId: string,
  ): Promise<void> {
    logger.info("PLUGIN", {
      msg: `Installing plugin ${pluginId} into ${this.scopeType}:${this.scopeId}`,
    });

    await executeCommand({ db: drizzle }, installPlugin, {
      pluginId,
      scopeType: this.scopeType,
      scopeId: this.scopeId,
    });
  }

  public async uninstall(
    drizzle: DrizzleTransaction,
    pluginId: string,
  ): Promise<void> {
    // 卸载前先停用
    if (this.activePlugins.has(pluginId)) {
      await this.deactivate(drizzle, pluginId);
    }

    const installation = assertSingleNonNullish(
      [
        await executeQuery({ db: drizzle }, getPluginInstallation, {
          pluginId,
          scopeType: this.scopeType,
          scopeId: this.scopeId,
        }),
      ].filter((r): r is { id: number } => r !== null),
      `Plugin ${pluginId} not installed in ${this.scopeType}:${this.scopeId}`,
    );

    await executeCommand({ db: drizzle }, uninstallPlugin, {
      installationId: installation.id,
    });
  }

  /**
   * 重新激活当前 scope 的所有已安装插件
   */
  public async restore(drizzle: DrizzleTransaction, app: Hono): Promise<void> {
    const installations = await executeQuery(
      { db: drizzle },
      listInstalledPlugins,
      { scopeType: this.scopeType, scopeId: this.scopeId },
    );

    await Promise.all(
      installations.map(async ({ pluginId }) =>
        this.activate(drizzle, pluginId, app),
      ),
    );
  }

  /**
   * 激活插件
   * 拆分为多个私有方法，职责清晰：
   *  ensureDefinitionSynced → mergeConfigDefaults → loadPlugin →
   *  invokeOnActivate → syncDynamicServices → registerServices →
   *  registerComponents → mountRoutes
   */
  public async activate(
    drizzle: DbHandle,
    pluginId: string,
    app: Hono,
  ): Promise<void> {
    if (this.activePlugins.has(pluginId)) {
      logger.warn("PLUGIN", {
        msg: `Plugin ${pluginId} is already active, skipping.`,
      });
      return;
    }

    await this.ensureDefinitionSynced(drizzle, pluginId);
    await this.mergeConfigDefaults(drizzle, pluginId);
    const { pluginObj, context } = await this.loadPlugin(drizzle, pluginId);
    await this.invokeOnActivate(pluginObj, context);
    await this.syncDynamicServices(drizzle, pluginId, pluginObj, context);
    await this.registerServices(drizzle, pluginId, pluginObj, context);
    await this.registerComponents(pluginId, pluginObj, context);
    await this.mountRoutes(pluginId, pluginObj, context, app);

    this.activePlugins.set(pluginId, pluginObj);

    logger.info("PLUGIN", {
      msg: `Plugin ${pluginId} activated in ${this.scopeType}:${this.scopeId}`,
    });
  }

  /**
   * 停用插件并清理所有内存注册
   */
  public async deactivate(drizzle: DbHandle, pluginId: string): Promise<void> {
    const pluginObj = this.activePlugins.get(pluginId);
    if (!pluginObj) return;

    // 1. 调用 onDeactivate 钩子
    await this.invokeOnDeactivate(pluginObj, drizzle, pluginId);

    // 2. 清理 ServiceRegistry
    this.serviceRegistry.removeByPlugin(pluginId);

    // 3. 清理 ComponentRegistry
    this.componentRegistry.removeByPlugin(pluginId);

    // 4. 清理路由代理
    this.routeRegistry.remove(pluginId);

    this.activePlugins.delete(pluginId);

    logger.info("PLUGIN", {
      msg: `Plugin ${pluginId} deactivated in ${this.scopeType}:${this.scopeId}`,
    });
  }

  /**
   * 单插件热重载：deactivate → activate
   * 用于配置更新后刷新服务实例
   */
  public async reloadPlugin(
    drizzle: DbHandle,
    pluginId: string,
    app: Hono,
  ): Promise<void> {
    await this.deactivate(drizzle, pluginId);
    await this.activate(drizzle, pluginId, app);
  }

  // ────────────────────────────────────────────
  //  路由代理
  // ────────────────────────────────────────────

  /**
   * 获取路由注册表，用于在应用启动时注册 catch-all 中间件
   */
  public getRouteRegistry(): PluginRouteRegistry {
    return this.routeRegistry;
  }

  // ────────────────────────────────────────────
  //  服务 & 组件查询 API
  // ────────────────────────────────────────────

  public getService<T extends PluginServiceType>(
    pluginId: string,
    type: T,
    id: string,
  ):
    | (RegisteredService & {
        service: PluginServiceMap[T];
      })
    | null {
    const found = this.serviceRegistry.get(pluginId, type, id);

    if (!found) return null;
    // oxlint-disable-next-line no-unsafe-type-assertion
    return found as RegisteredService & {
      service: PluginServiceMap[T];
    };
  }

  public getAllServices(): RegisteredService[] {
    return this.serviceRegistry.getAll();
  }

  public getServices<T extends PluginServiceType>(
    type: T,
  ): (RegisteredService & {
    service: PluginServiceMap[T];
  })[] {
    const services = this.getAllServices().filter(
      (service) => service.type === type,
    );

    // oxlint-disable-next-line no-unsafe-type-assertion
    return services as unknown as (RegisteredService & {
      service: PluginServiceMap[T];
    })[];
  }

  public getComponents(pluginId: string): ComponentRecord[] {
    return this.componentRegistry.get(pluginId);
  }

  public getComponentOfSlot(slot: string): ComponentRecord[] {
    return this.componentRegistry.getSlot(slot);
  }

  public getLoader(): PluginLoader {
    return this.loader;
  }

  public getDiscovery(): PluginDiscoveryService {
    return this.discovery;
  }

  // ────────────────────────────────────────────
  //  activate() 拆分的私有方法
  // ────────────────────────────────────────────

  /**
   * 确保插件定义已同步到 DB
   */
  private async ensureDefinitionSynced(
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<void> {
    await this.discovery.registerDefinition(drizzle, pluginId);
  }

  /**
   * 合并配置默认值到现有配置实例
   */
  private async mergeConfigDefaults(
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<void> {
    const data = await executeQuery(
      { db: drizzle },
      getPluginConfigInstanceByInstallation,
      { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
    );

    if (!data) return;

    const schema = JSONSchemaSchema.parse(data.schema);
    const defaults = getDefaultFromSchema(schema);

    // Object-merge defaults only applies to object-typed configs.
    // For arrays or other non-object types, keep the instance value as-is
    // (there is no sensible "merge" for arrays).
    const isObjectSchema =
      typeof schema !== "boolean" && schema.type === "object";

    const instanceValue = data.value;

    if (!isObjectSchema || Array.isArray(instanceValue)) {
      // If there is no stored value yet, seed with schema defaults
      if (
        instanceValue === null ||
        instanceValue === undefined ||
        (typeof instanceValue === "object" &&
          !Array.isArray(instanceValue) &&
          Object.keys(instanceValue).length === 0)
      ) {
        const schemaType =
          typeof schema !== "boolean" ? schema.type : undefined;
        const fallback = defaults ?? (schemaType === "array" ? [] : {});
        if (JSON.stringify(fallback) !== JSON.stringify(instanceValue)) {
          await executeCommand(
            { db: drizzle },
            updatePluginConfigInstanceValue,
            { instanceId: data.instanceId, value: fallback },
          );
        }
      }
      return;
    }

    const defaultsObj =
      defaults && typeof defaults === "object" && !Array.isArray(defaults)
        ? defaults
        : {};

    const instanceObj =
      instanceValue &&
      typeof instanceValue === "object" &&
      !Array.isArray(instanceValue)
        ? instanceValue
        : {};

    const newValue: JSONObject = {
      ...defaultsObj,
      ...instanceObj,
    };

    if (JSON.stringify(newValue) !== JSON.stringify(instanceValue)) {
      logger.info("PLUGIN", {
        msg: `Updating config instance for ${pluginId}`,
      });
      await executeCommand({ db: drizzle }, updatePluginConfigInstanceValue, {
        instanceId: data.instanceId,
        value: newValue,
      });
    }
  }

  /**
   * 加载插件模块实例并构建上下文
   */
  private async loadPlugin(
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<{ pluginObj: CatPlugin; context: PluginContext }> {
    const pluginObj = await this.loader.getInstance(pluginId);
    const config = await getPluginConfig(
      drizzle,
      pluginId,
      this.scopeType,
      this.scopeId,
    );

    const registeredServices = await executeQuery(
      { db: drizzle },
      listPluginServicesForInstallation,
      { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
    );

    const context: PluginContext = {
      config,
      scopeType: this.scopeType,
      scopeId: this.scopeId,
      registeredServices,
      capabilities: this.createCapabilities(drizzle),
      cacheStore: getCacheStore(),
      sessionStore: getSessionStore(),
    };

    return { pluginObj, context };
  }

  /**
   * 调用 onActivate 生命周期钩子
   */
  private async invokeOnActivate(
    pluginObj: CatPlugin,
    context: PluginContext,
  ): Promise<void> {
    if (pluginObj.onActivate) {
      await pluginObj.onActivate(context);
    }
  }

  /**
   * 同步动态服务到 DB
   * 处理 manifest 声明的静态服务 + 运行时 services() 返回的动态服务
   */
  private async syncDynamicServices(
    drizzle: DbHandle,
    pluginId: string,
    pluginObj: CatPlugin,
    context: PluginContext,
  ): Promise<void> {
    const installation = await executeQuery(
      { db: drizzle },
      getPluginInstallation,
      { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
    );
    if (!installation) return;

    const manifest = await this.loader.getManifest(pluginId);

    // 获取 DB 中已有的服务记录
    const existingDBServices = await executeQuery(
      { db: drizzle },
      listPluginServices,
      { pluginInstallationId: installation.id },
    );

    const existingKeys = new Set(
      existingDBServices.map((s) => `${s.serviceType}:${s.serviceId}`),
    );

    // 静态服务集合（manifest 中非 dynamic 的服务）
    const staticServices = (manifest.services ?? []).filter((s) => !s.dynamic);
    const staticKeys = new Set(staticServices.map((s) => `${s.type}:${s.id}`));

    // 收集运行时服务
    let runtimeServices: IPluginService[] = [];
    if (pluginObj.services) {
      runtimeServices = await pluginObj.services(context);
    }

    const runtimeKeys = new Set(
      runtimeServices.map((s) => `${s.getType()}:${s.getId()}`),
    );

    // 需要新增到 DB 的：静态+动态运行时中，DB 里还没有的
    const allDesiredKeys = new Set([...staticKeys, ...runtimeKeys]);
    const toInsertKeys = [...allDesiredKeys].filter(
      (key) => !existingKeys.has(key),
    );

    if (toInsertKeys.length > 0) {
      await executeCommand({ db: drizzle }, syncPluginServices, {
        pluginInstallationId: installation.id,
        services: toInsertKeys.map((key) => {
          const [serviceType, ...rest] = key.split(":");
          const serviceId = rest.join(":");
          return {
            serviceId,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion
            serviceType: serviceType as PluginServiceType,
          };
        }),
      });
    }

    // 需要删除的：DB 中有但运行时和静态中都没有的（仅动态服务可被删除）
    const toDelete = existingDBServices.filter(
      (s) =>
        !allDesiredKeys.has(`${s.serviceType}:${s.serviceId}`) &&
        !staticKeys.has(`${s.serviceType}:${s.serviceId}`),
    );

    if (toDelete.length > 0) {
      await this.safeDeleteServices(drizzle, toDelete);
    }
  }

  /**
   * 安全删除动态服务：检查外键引用，被引用的服务保留为 orphaned
   */
  private async safeDeleteServices(
    drizzle: DbHandle,
    toDelete: { id: number; serviceId: string; serviceType: string }[],
  ): Promise<void> {
    const safeToDeleteIds: number[] = [];

    for (const svc of toDelete) {
      // oxlint-disable-next-line no-await-in-loop
      const hasRef = await executeQuery(
        { db: drizzle },
        checkServiceReferences,
        { serviceDbId: svc.id },
      );

      if (hasRef) {
        logger.warn("PLUGIN", {
          msg: `Service ${svc.serviceType}:${svc.serviceId} (dbId=${svc.id}) is referenced, keeping as orphaned`,
        });
      } else {
        safeToDeleteIds.push(svc.id);
      }
    }

    if (safeToDeleteIds.length > 0) {
      await executeCommand({ db: drizzle }, deletePluginServices, {
        serviceDbIds: safeToDeleteIds,
      });
    }
  }

  /**
   * 注册插件服务到内存 ServiceRegistry
   */
  private async registerServices(
    drizzle: DbHandle,
    pluginId: string,
    pluginObj: CatPlugin,
    context: PluginContext,
  ): Promise<void> {
    if (!pluginObj.services) return;

    const services = await pluginObj.services(context);

    await this.serviceRegistry.combine(
      drizzle,
      this.scopeType,
      this.scopeId,
      pluginId,
      services,
    );
  }

  /**
   * 注册插件组件到内存 ComponentRegistry
   */
  private async registerComponents(
    pluginId: string,
    pluginObj: CatPlugin,
    context: PluginContext,
  ): Promise<void> {
    if (!pluginObj.components) return;

    const components = await pluginObj.components(context);
    this.componentRegistry.combine(
      pluginId,
      components.map((c) => ({ ...c, pluginId })),
    );
  }

  /**
   * 挂载插件路由到路由注册表（中间件代理模式）
   */
  private async mountRoutes(
    pluginId: string,
    pluginObj: CatPlugin,
    context: PluginContext,
    _app: Hono,
  ): Promise<void> {
    if (!pluginObj.routes) return;

    const route = new Hono();
    const baseURL = `/_plugin/${this.scopeType}/${this.scopeId}/${pluginId}`;
    await pluginObj.routes({ ...context, baseURL, app: route });
    this.routeRegistry.register(pluginId, route);
  }

  // ────────────────────────────────────────────
  //  deactivate 辅助方法
  // ────────────────────────────────────────────

  private async invokeOnDeactivate(
    pluginObj: CatPlugin,
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<void> {
    if (!pluginObj.onDeactivate) return;

    const config = await getPluginConfig(
      drizzle,
      pluginId,
      this.scopeType,
      this.scopeId,
    );

    try {
      await pluginObj.onDeactivate({
        config,
        scopeType: this.scopeType,
        scopeId: this.scopeId,
        registeredServices: [],
        capabilities: this.createCapabilities(drizzle),
        cacheStore: getCacheStore(),
        sessionStore: getSessionStore(),
      });
    } catch (e) {
      logger.error("PLUGIN", { msg: `Error deactivating ${pluginId}` }, e);
    }
  }
}
