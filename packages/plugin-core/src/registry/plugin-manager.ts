import { readFile } from "node:fs/promises";

import type { DbHandle, DrizzleClient, DrizzleTransaction } from "@cat/domain";
import {
  deletePluginServices,
  executeCommand,
  executeQuery,
  getPluginInstallation,
  installPlugin,
  listInstalledPlugins,
  listPluginServices,
  listPluginServicesForInstallation,
  syncPluginServices,
  uninstallPlugin,
} from "@cat/domain";
import {
  createPluginCapabilities,
  getCacheStore,
  getSessionStore,
  type PluginCapabilities,
} from "@cat/domain";
import type { PluginData, PluginServiceType, ScopeType } from "@cat/shared";
import type { JSONType } from "@cat/shared";
import { assertSingleNonNullish, logger } from "@cat/shared";
import { Hono } from "hono";

import type {
  CatPlugin,
  PluginContext,
  PluginLogger,
} from "#/entities/plugin.ts";
import {
  ComponentRecordSchema,
  ComponentRegistry,
  type ComponentRecord,
} from "#/registry/component-registry.ts";
import {
  FileSystemPluginLoader,
  type PluginLoader,
} from "#/registry/loader.ts";
import { PluginDiscoveryService } from "#/registry/plugin-discovery.ts";
import { PluginRouteRegistry } from "#/registry/plugin-route-registry.ts";
import {
  resolveRegisteredServiceImplementationReference,
  createServiceImplementationReference,
  type ServiceImplementationReference,
  type ServiceImplementationResolution,
} from "#/registry/service-implementation-reference.ts";
import {
  ServiceRegistry,
  type RegisteredService,
} from "#/registry/service-registry.ts";
import type { IPluginService } from "#/services/service.ts";
import type { PluginServiceMap } from "#/types/plugin.ts";
import {
  getPluginRuntimeConfigurationSnapshot,
  type PluginRuntimeConfigurationSnapshot,
} from "#/utils/config.ts";

const pluginManagerInstanceMarker = Symbol.for("cat.plugin-manager.instance");

export type DefaultPluginSource = string | string[];

/**
 * Observation snapshot for a single plugin in the in-memory runtime.
 */
export type PluginRuntimeSnapshot = {
  /** Whether the plugin is active. */
  isActive: boolean;
  /** Services currently registered in memory. */
  services: RegisteredService[];
  /** Components currently registered in memory. */
  components: ComponentRecord[];
  /** Whether a plugin route is currently mounted. */
  hasRoute: boolean;
};

export type ServiceRuntimeSnapshot = {
  registeredService: RegisteredService;
  reference: ServiceImplementationReference;
  package: Readonly<{ name: string; version: string }>;
  configuration: PluginRuntimeConfigurationSnapshot;
  activationGeneration: number;
};

type ActivePluginRuntime = {
  plugin: CatPlugin;
  context: PluginContext;
};

type PreparedPluginRuntime = ActivePluginRuntime & {
  services: RegisteredService[];
  components: ComponentRecord[];
  route: Hono | undefined;
  packageData: PluginData;
  configuration: PluginRuntimeConfigurationSnapshot;
};

export type ScopedPluginManagerInstallation = {
  manager: PluginManager;
  restore: () => void;
};

type ScopedPluginManagerInstallationState = {
  previous: PluginManager | undefined;
  revoked: boolean;
};

/**
 * 作用域插件管理器
 * 必须绑定到一个具体的 Scope
 * 负责管理该作用域下的插件生命周期：
 * Discovery → Registration → Installation → Activation → (ConfigReload) → Deactivation → Uninstallation
 */
export class PluginManager {
  private static readonly instances = new Map<string, PluginManager>();
  private static readonly scopedInstallations = new WeakMap<
    PluginManager,
    ScopedPluginManagerInstallationState
  >();

  private activePlugins = new Map<string, ActivePluginRuntime>();
  private readonly serviceRuntimeSnapshots = new Map<
    string,
    readonly ServiceRuntimeSnapshot[]
  >();
  private readonly activationGenerations = new Map<string, number>();
  private readonly lifecycleTails = new Map<string, Promise<void>>();
  private readonly routeRegistry = new PluginRouteRegistry();

  public readonly scopeType: ScopeType;
  public readonly scopeId: string;
  private readonly loader: PluginLoader;
  private discovery: PluginDiscoveryService;
  private readonly serviceRegistry: ServiceRegistry;
  private readonly componentRegistry: ComponentRegistry;
  private readonly diagnosticLogger: PluginLogger;

  public constructor(
    scopeType: ScopeType,
    scopeId: string,
    loader?: PluginLoader,
    discovery?: PluginDiscoveryService,
    serviceRegistry?: ServiceRegistry,
    componentRegistry: ComponentRegistry = new ComponentRegistry(),
    diagnosticLogger: PluginLogger = logger,
  ) {
    Object.defineProperty(this, pluginManagerInstanceMarker, { value: true });
    this.scopeType = scopeType;
    this.scopeId = scopeId;
    this.loader = loader ?? new FileSystemPluginLoader({ diagnosticLogger });
    this.discovery = discovery ?? new PluginDiscoveryService(this.loader);
    this.serviceRegistry =
      serviceRegistry ?? new ServiceRegistry([], diagnosticLogger);
    this.componentRegistry = componentRegistry;
    this.diagnosticLogger = diagnosticLogger;
  }

  private createCapabilities = (
    drizzle: DbHandle,
    pluginId: string,
  ): PluginCapabilities => {
    const checkPermission = this.createCheckPermission(pluginId);
    return createPluginCapabilities({ db: drizzle }, checkPermission);
  };

  /**
   * 构建作用域范围限制的权限检查函数
   * 项目作用域的插件只能访问其所属项目内的资源
   */
  private createCheckPermission =
    (_pluginId: string) =>
    async (
      objectType: string,
      _relation: string,
      objectId: string,
    ): Promise<boolean> => {
      // 全局作用域的插件拥有全局权限
      if (this.scopeType === "GLOBAL") return true;
      // 项目作用域的插件只能对其 scopeId 对应的项目执行操作
      if (this.scopeType === "PROJECT" && objectType === "project") {
        return objectId === this.scopeId;
      }
      return true;
    };

  /**
   * 获取或创建特定作用域的管理器实例
   * 使用类型安全的 Map 缓存替代 globalThis
   */
  public static get(
    scopeType: ScopeType,
    scopeId: string,
    loader?: PluginLoader,
    diagnosticLogger?: PluginLogger,
  ): PluginManager {
    const key = `${scopeType}:${scopeId}`;
    let instance = PluginManager.instances.get(key);
    if (instance) {
      if (loader && loader !== instance.getLoader()) {
        throw new Error(
          `PluginManager for scope ${key} already exists with a different loader; call PluginManager.clear() before replacing loaders`,
        );
      }
      if (
        diagnosticLogger &&
        diagnosticLogger !== instance.getDiagnosticLogger()
      ) {
        throw new Error(
          `PluginManager for scope ${key} already exists with a different diagnostic logger; call PluginManager.clear() before replacing diagnostic loggers`,
        );
      }

      return instance;
    }

    instance = new PluginManager(
      scopeType,
      scopeId,
      loader,
      undefined,
      undefined,
      undefined,
      diagnosticLogger,
    );
    PluginManager.instances.set(key, instance);

    return instance;
  }

  public static isInstance(value: unknown): value is PluginManager {
    return (
      typeof value === "object" &&
      value !== null &&
      Reflect.get(value, pluginManagerInstanceMarker) === true
    );
  }

  /**
   * Install a manager for one scope and return an owner-aware restoration
   * handle for temporary runtimes.
   */
  public static installScoped(
    scopeType: ScopeType,
    scopeId: string,
    loader?: PluginLoader,
    diagnosticLogger?: PluginLogger,
  ): ScopedPluginManagerInstallation {
    const key = `${scopeType}:${scopeId}`;
    const previous = PluginManager.instances.get(key);
    const manager = new PluginManager(
      scopeType,
      scopeId,
      loader,
      undefined,
      undefined,
      undefined,
      diagnosticLogger,
    );
    PluginManager.instances.set(key, manager);
    const state: ScopedPluginManagerInstallationState = {
      previous,
      revoked: false,
    };
    PluginManager.scopedInstallations.set(manager, state);

    return {
      manager,
      restore: () => {
        if (state.revoked) return;
        state.revoked = true;
        if (PluginManager.instances.get(key) !== manager) return;
        const livePrevious = PluginManager.resolveLivePrevious(previous);
        if (livePrevious === undefined) PluginManager.instances.delete(key);
        else PluginManager.instances.set(key, livePrevious);
      },
    };
  }

  private static resolveLivePrevious(
    manager: PluginManager | undefined,
  ): PluginManager | undefined {
    let candidate = manager;
    while (candidate !== undefined) {
      const installation = PluginManager.scopedInstallations.get(candidate);
      if (installation === undefined || !installation.revoked) return candidate;
      candidate = installation.previous;
    }
    return undefined;
  }

  public static clear(): void {
    PluginManager.instances.clear();
    PluginDiscoveryService.clear();
  }

  private async withLifecycleLock<T>(
    pluginId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.lifecycleTails.get(pluginId) ?? Promise.resolve();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(async () => await gate);
    this.lifecycleTails.set(pluginId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.lifecycleTails.get(pluginId) === tail) {
        this.lifecycleTails.delete(pluginId);
      }
    }
  }

  private static async readDefaultPluginIds(
    source: DefaultPluginSource,
  ): Promise<string[]> {
    if (Array.isArray(source)) {
      return source;
    }

    const parsed: unknown = JSON.parse(await readFile(source, "utf-8"));
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  }

  /**
   * 安装默认插件
   * 从配置文件读取默认插件列表，安装尚未安装的插件
   */
  public static async installDefaults(
    drizzle: DrizzleClient,
    manager: PluginManager,
    defaultPlugins: DefaultPluginSource,
  ): Promise<void> {
    const pluginIds = await PluginManager.readDefaultPluginIds(defaultPlugins);

    const installed = new Set(
      (
        await executeQuery({ db: drizzle }, listInstalledPlugins, {
          scopeType: manager.scopeType,
          scopeId: manager.scopeId,
        })
      ).map((i) => i.pluginId),
    );

    const toInstall = pluginIds.filter((id) => !installed.has(id));

    for (const id of toInstall) {
      // 安装默认插件时可能运行在单个事务连接上，必须串行执行。
      // 否则 pg 会在同一 client 上并发 query，导致启动期事务不稳定。
      // oxlint-disable-next-line no-await-in-loop
      await manager.install(drizzle, id);
    }
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
    await this.withLifecycleLock(pluginId, async () => {
      this.diagnosticLogger
        .child({ component: "plugin" })
        .info(
          `Installing plugin ${pluginId} into ${this.scopeType}:${this.scopeId}`,
        );

      await this.ensureDefinitionSynced(drizzle, pluginId);

      await executeCommand({ db: drizzle }, installPlugin, {
        pluginId,
        scopeType: this.scopeType,
        scopeId: this.scopeId,
      });
    });
  }

  public async uninstall(
    drizzle: DrizzleTransaction,
    pluginId: string,
  ): Promise<void> {
    await this.withLifecycleLock(pluginId, async () => {
      if (this.activePlugins.has(pluginId)) {
        await this.deactivateUnlocked(drizzle, pluginId);
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
    });
  }

  /**
   * 重新激活当前 scope 的所有已安装插件
   * 必须使用长期有效的连接（pool client），而非事务句柄，
   * 否则激活时构建的 capabilities 会持有已关闭的事务连接。
   */
  public async restore(drizzle: DbHandle): Promise<void> {
    const installations = await executeQuery(
      { db: drizzle },
      listInstalledPlugins,
      { scopeType: this.scopeType, scopeId: this.scopeId },
    );

    for (const { pluginId } of installations) {
      // 插件激活必须串行，避免在同一连接上并发查询。
      // oxlint-disable-next-line no-await-in-loop
      await this.activate(drizzle, pluginId);
    }
  }

  /**
   * 激活插件
   * 拆分为多个私有方法，职责清晰：
   *  ensureDefinitionSynced → loadPlugin →
   *  invokeOnActivate → prepare services/components/routes → atomic publish
   */
  public async activate(drizzle: DbHandle, pluginId: string): Promise<void> {
    await this.withLifecycleLock(
      pluginId,
      async () => await this.activateUnlocked(drizzle, pluginId),
    );
  }

  private async activateUnlocked(
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<void> {
    if (this.activePlugins.has(pluginId)) {
      this.diagnosticLogger
        .child({ component: "plugin" })
        .warn(`Plugin ${pluginId} is already active, skipping.`);
      return;
    }

    const prepared = await this.preparePluginRuntime(drizzle, pluginId);
    this.publishPluginRuntime(pluginId, prepared);

    this.diagnosticLogger
      .child({ component: "plugin" })
      .info(
        `Plugin ${pluginId} activated in ${this.scopeType}:${this.scopeId}`,
      );
  }

  /**
   * 停用插件并清理所有内存注册
   */
  public async deactivate(drizzle: DbHandle, pluginId: string): Promise<void> {
    await this.withLifecycleLock(
      pluginId,
      async () => await this.deactivateUnlocked(drizzle, pluginId),
    );
  }

  /**
   * 单插件热重载：prepare candidate → publish → deactivate previous context
   * 用于配置更新后无中断地刷新服务实例
   */
  public async reloadPlugin(
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<void> {
    await this.withLifecycleLock(pluginId, async () => {
      const current = this.activePlugins.get(pluginId);
      const prepared = await this.preparePluginRuntime(drizzle, pluginId);
      this.publishPluginRuntime(pluginId, prepared);
      if (current) {
        await this.invokeOnDeactivateBestEffort(
          current.plugin,
          current.context,
        );
      }
    });
  }

  /**
   * Return whether the plugin is currently active in this scoped runtime.
   *
   * @param pluginId - Plugin ID
   * @returns - True when active
   */
  public isActive(pluginId: string): boolean {
    return this.activePlugins.has(pluginId);
  }

  /**
   * Get the plugin's current service, component, and route snapshot.
   *
   * @param pluginId - Plugin ID
   * @returns - Runtime observation snapshot
   */
  public getRuntimeSnapshot(pluginId: string): PluginRuntimeSnapshot {
    return {
      isActive: this.isActive(pluginId),
      services: this.serviceRegistry
        .getAll()
        .filter((service) => service.pluginId === pluginId),
      components: this.componentRegistry.get(pluginId),
      hasRoute: this.routeRegistry.resolve(pluginId) !== undefined,
    };
  }

  /**
   * Capture activation-bound service objects and provenance.
   *
   * The capture shares the plugin lifecycle lock, so each entry comes from a
   * fully published activation generation and never observes reload staging.
   */
  public async captureServiceRuntimeSnapshots<T extends PluginServiceType>(
    type: T,
  ): Promise<
    Array<
      ServiceRuntimeSnapshot & {
        registeredService: RegisteredService & {
          type: T;
          service: PluginServiceMap[T];
        };
        reference: ServiceImplementationReference & { serviceType: T };
      }
    >
  > {
    const pluginIds = [...this.serviceRuntimeSnapshots.keys()].sort();
    const captures = await Promise.all(
      pluginIds.map(
        async (pluginId) =>
          await this.withLifecycleLock(pluginId, async () => [
            ...(this.serviceRuntimeSnapshots.get(pluginId) ?? []),
          ]),
      ),
    );
    const matching = captures
      .flat()
      .filter((snapshot) => snapshot.registeredService.type === type);

    // The runtime type discriminator narrows both the service and reference.
    return matching as Array<
      ServiceRuntimeSnapshot & {
        registeredService: RegisteredService & {
          type: T;
          service: PluginServiceMap[T];
        };
        reference: ServiceImplementationReference & { serviceType: T };
      }
    >;
  }

  /**
   * Create transient service instances with candidate config without registering services, components, or routes.
   *
   * @param drizzle - Long-lived database handle
   * @param pluginId - Plugin ID
   * @param configOverride - Candidate config value
   * @returns - Transient service instances
   */
  public async createTransientServices(
    drizzle: DbHandle,
    pluginId: string,
    configOverride: JSONType,
  ): Promise<IPluginService[]> {
    const pluginObj = await this.loader.getInstance(pluginId);
    if (!pluginObj.services) return [];

    const { context } = await this.createPluginContext(
      drizzle,
      pluginId,
      configOverride,
    );
    return await pluginObj.services(context);
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

  /**
   * Resolve a persisted service identity in this manager's installation scope.
   * The result keeps configuration and runtime failures distinct for callers.
   */
  public resolveServiceImplementationReference<T extends PluginServiceType>(
    reference: ServiceImplementationReference,
    expectedServiceType: T,
  ): ServiceImplementationResolution<T> {
    if (!this.isActive(reference.pluginId)) {
      return {
        kind: "PACKAGE_NOT_LOADED",
        reference,
        expectedServiceType,
      };
    }

    return resolveRegisteredServiceImplementationReference(
      this.serviceRegistry,
      { scopeType: this.scopeType, scopeId: this.scopeId },
      reference,
      expectedServiceType,
    );
  }

  public createServiceImplementationReference(
    service: Pick<RegisteredService, "pluginId" | "id" | "type">,
  ): ServiceImplementationReference {
    return createServiceImplementationReference(
      { scopeType: this.scopeType, scopeId: this.scopeId },
      service,
    );
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

  public getDiagnosticLogger(): PluginLogger {
    return this.diagnosticLogger;
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
   * 加载插件模块实例并构建上下文
   */
  private async createPluginContext(
    drizzle: DbHandle,
    pluginId: string,
    configOverride?: JSONType,
  ): Promise<{
    context: PluginContext;
    configuration: PluginRuntimeConfigurationSnapshot;
  }> {
    const configuration =
      configOverride === undefined
        ? await getPluginRuntimeConfigurationSnapshot(
            drizzle,
            pluginId,
            this.scopeType,
            this.scopeId,
          )
        : {
            semanticConfig: configOverride,
            configurationDigest: "transient",
            appliedVersion: null,
            schemaVersion: null,
            schemaDigest: null,
          };

    // Candidate probes pass an explicit config override and must remain
    // service-independent: do not read installation state while constructing
    // transient services. Runtime activation still loads the persisted list.
    const registeredServices =
      configOverride === undefined
        ? await executeQuery(
            { db: drizzle },
            listPluginServicesForInstallation,
            { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
          )
        : [];

    return {
      configuration,
      context: {
        config: configuration.semanticConfig,
        scopeType: this.scopeType,
        scopeId: this.scopeId,
        registeredServices,
        capabilities: this.createCapabilities(drizzle, pluginId),
        logger: this.diagnosticLogger.child({
          component: "plugin",
          pluginId,
          scopeId: this.scopeId,
          scopeType: this.scopeType,
        }),
        cacheStore: getCacheStore(),
        sessionStore: getSessionStore(),
        auth: {
          pluginId,
          scopeType: this.scopeType,
          scopeId: this.scopeId,
          checkPermission: this.createCheckPermission(pluginId),
        },
      },
    };
  }

  /**
   * 加载插件模块实例并构建上下文
   */
  private async loadPlugin(
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<{
    pluginObj: CatPlugin;
    context: PluginContext;
    configuration: PluginRuntimeConfigurationSnapshot;
    packageData: PluginData;
  }> {
    const [pluginObj, packageData, runtimeContext] = await Promise.all([
      this.loader.getInstance(pluginId),
      this.loader.getData(pluginId),
      this.createPluginContext(drizzle, pluginId),
    ]);

    return { pluginObj, packageData, ...runtimeContext };
  }

  private async preparePluginRuntime(
    drizzle: DbHandle,
    pluginId: string,
  ): Promise<PreparedPluginRuntime> {
    await this.ensureDefinitionSynced(drizzle, pluginId);
    const { pluginObj, context, configuration, packageData } =
      await this.loadPlugin(drizzle, pluginId);
    let activationStarted = false;
    try {
      activationStarted = true;
      await this.invokeOnActivate(pluginObj, context);
      const runtimeServices = await this.syncDynamicServices(
        drizzle,
        pluginId,
        pluginObj,
        context,
      );
      const [services, components, route] = await Promise.all([
        this.serviceRegistry.prepare(
          drizzle,
          this.scopeType,
          this.scopeId,
          pluginId,
          runtimeServices,
        ),
        this.prepareComponents(pluginId, pluginObj, context),
        this.prepareRoute(pluginId, pluginObj, context),
      ]);
      return {
        plugin: pluginObj,
        context,
        configuration,
        packageData,
        services,
        components,
        route,
      };
    } catch (error) {
      if (activationStarted) {
        await this.invokeOnDeactivateBestEffort(pluginObj, context);
      }
      throw error;
    }
  }

  private publishPluginRuntime(
    pluginId: string,
    prepared: PreparedPluginRuntime,
  ): void {
    const activationGeneration =
      (this.activationGenerations.get(pluginId) ?? 0) + 1;
    const packageSnapshot = Object.freeze({
      name: prepared.packageData.name,
      version: prepared.packageData.version,
    });
    const serviceSnapshots = Object.freeze(
      prepared.services.map((registeredService) =>
        Object.freeze({
          registeredService,
          reference:
            this.createServiceImplementationReference(registeredService),
          package: packageSnapshot,
          configuration: prepared.configuration,
          activationGeneration,
        }),
      ),
    );

    this.serviceRegistry.replaceByPlugin(pluginId, prepared.services);
    this.componentRegistry.combine(pluginId, prepared.components);
    if (prepared.route) {
      this.routeRegistry.register(pluginId, prepared.route);
    } else {
      this.routeRegistry.remove(pluginId);
    }
    this.activePlugins.set(pluginId, {
      plugin: prepared.plugin,
      context: prepared.context,
    });
    this.activationGenerations.set(pluginId, activationGeneration);
    this.serviceRuntimeSnapshots.set(pluginId, serviceSnapshots);
  }

  private async deactivateUnlocked(
    _drizzle: DbHandle,
    pluginId: string,
  ): Promise<void> {
    const active = this.activePlugins.get(pluginId);
    if (!active) return;

    await this.invokeOnDeactivate(active.plugin, active.context);
    this.serviceRegistry.removeByPlugin(pluginId);
    this.componentRegistry.removeByPlugin(pluginId);
    this.routeRegistry.remove(pluginId);
    this.activePlugins.delete(pluginId);
    this.serviceRuntimeSnapshots.delete(pluginId);

    this.diagnosticLogger
      .child({ component: "plugin" })
      .info(
        `Plugin ${pluginId} deactivated in ${this.scopeType}:${this.scopeId}`,
      );
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
  ): Promise<IPluginService[]> {
    const installation = await executeQuery(
      { db: drizzle },
      getPluginInstallation,
      { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
    );
    if (!installation) return [];

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
      await executeCommand({ db: drizzle }, deletePluginServices, {
        serviceDbIds: toDelete.map((service) => service.id),
      });
    }

    return runtimeServices;
  }

  private async prepareComponents(
    pluginId: string,
    pluginObj: CatPlugin,
    context: PluginContext,
  ): Promise<ComponentRecord[]> {
    if (!pluginObj.components) return [];

    const components = await pluginObj.components(context);
    return ComponentRecordSchema.array().parse(
      components.map((component) => ({ ...component, pluginId })),
    );
  }

  private async prepareRoute(
    pluginId: string,
    pluginObj: CatPlugin,
    context: PluginContext,
  ): Promise<Hono | undefined> {
    if (!pluginObj.routes) return undefined;

    const route = new Hono();
    const baseURL = `/_plugin/${this.scopeType}/${this.scopeId}/${pluginId}`;
    await pluginObj.routes({ ...context, baseURL, app: route });
    return route;
  }

  // ────────────────────────────────────────────
  //  deactivate 辅助方法
  // ────────────────────────────────────────────

  private async invokeOnDeactivate(
    pluginObj: CatPlugin,
    context: PluginContext,
  ): Promise<void> {
    if (!pluginObj.onDeactivate) return;

    await pluginObj.onDeactivate(context);
  }

  private async invokeOnDeactivateBestEffort(
    pluginObj: CatPlugin,
    context: PluginContext,
  ): Promise<void> {
    if (!pluginObj.onDeactivate) return;

    try {
      await this.invokeOnDeactivate(pluginObj, context);
    } catch (e) {
      this.diagnosticLogger
        .child({ component: "plugin" })
        .error(`Error deactivating ${context.auth.pluginId}`, { error: e });
    }
  }
}
