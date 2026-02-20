import { Hono } from "hono";
import {
  _JSONSchemaSchema,
  JSONSchemaSchema,
  type JSONObject,
} from "@cat/shared/schema/json";
import {
  getDefaultFromSchema,
  assertSingleNonNullish,
  logger,
} from "@cat/shared/utils";
import {
  eq,
  and,
  pluginComponent,
  pluginConfig,
  pluginConfigInstance,
  pluginInstallation,
  pluginService,
  type DrizzleClient,
  type DrizzleTransaction,
} from "@cat/db";
import {
  ServiceRegistry,
  type RegisteredService,
} from "@/registry/service-registry";
import type {
  PluginServiceType,
  ScopeType,
} from "@cat/shared/schema/drizzle/enum";
import {
  ComponentRegistry,
  type ComponentRecord,
} from "@/registry/component-registry";
import type { CatPlugin, PluginContext } from "@/entities/plugin";
import { getPluginConfig } from "@/utils/config";
import { FileSystemPluginLoader, type PluginLoader } from "./loader";
import { PluginDiscoveryService } from "./plugin-discovery";
import type { PluginServiceMap } from "@/types/plugin";

/**
 * 作用域插件管理器
 * 必须绑定到一个具体的 Scope
 * 负责管理该作用域下的插件生命周期：安装 -> 激活 -> 停用 -> 卸载
 */
export class PluginManager {
  private activePlugins = new Map<string, CatPlugin>();

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

  /**
   * 获取或创建特定作用域的管理器实例
   * 使用工厂模式确保 Scope 的唯一性
   */
  public static get(
    scopeType: ScopeType,
    scopeId: string,
    loader?: PluginLoader,
  ): PluginManager {
    const key = `__PLUGIN_MGR_${scopeType}_${scopeId}__`;
    // @ts-expect-error global usage
    if (!globalThis[key]) {
      const manager = new PluginManager(scopeType, scopeId, loader);

      // @ts-expect-error globalThis
      globalThis[key] = manager;
    }

    // @ts-expect-error global usage
    // oxlint-disable-next-line no-unsafe-type-assertion
    return globalThis[key] as PluginManager;
  }

  /**
   * 安装插件到当前 manager 所在的 scope
   */
  public async install(
    drizzle: DrizzleClient,
    pluginId: string,
  ): Promise<void> {
    const loader = this.discovery.getLoader();
    const manifest = await loader.getManifest(pluginId);

    logger.info("PLUGIN", {
      msg: `Installing plugin ${pluginId} into ${this.scopeType}:${this.scopeId}`,
    });

    await drizzle.transaction(async (tx) => {
      // 创建安装记录
      const installation = assertSingleNonNullish(
        await tx
          .insert(pluginInstallation)
          .values([
            { pluginId, scopeType: this.scopeType, scopeId: this.scopeId },
          ])
          .returning({ id: pluginInstallation.id }),
      );

      // 初始化配置
      const pluginConfigs = await tx
        .select({ id: pluginConfig.id, schema: pluginConfig.schema })
        .from(pluginConfig)
        .where(eq(pluginConfig.pluginId, pluginId));

      if (pluginConfigs.length > 0) {
        await tx.insert(pluginConfigInstance).values(
          pluginConfigs.map((config) => ({
            configId: config.id,
            pluginInstallationId: installation.id,
            value:
              getDefaultFromSchema(JSONSchemaSchema.parse(config.schema)) ?? {},
          })),
        );
      }

      // 注册声明的组件 (持久化)
      if (manifest.components?.length) {
        await tx.insert(pluginComponent).values(
          manifest.components.map((c) => ({
            componentId: c.id,
            slot: c.slot,
            url: c.url,
            pluginInstallationId: installation.id,
          })),
        );
      }

      // 注册声明的服务 (持久化)
      if (manifest.services?.length) {
        await tx.insert(pluginService).values(
          manifest.services.map((s) => ({
            serviceId: s.id,
            serviceType: s.type,
            pluginInstallationId: installation.id,
          })),
        );
      }
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
      await drizzle
        .select({ id: pluginInstallation.id })
        .from(pluginInstallation)
        .where(
          and(
            eq(pluginInstallation.pluginId, pluginId),
            eq(pluginInstallation.scopeId, this.scopeId),
            eq(pluginInstallation.scopeType, this.scopeType),
          ),
        ),
      `Plugin ${pluginId} not installed in ${this.scopeType}:${this.scopeId}`,
    );

    await drizzle
      .delete(pluginInstallation)
      .where(eq(pluginInstallation.id, installation.id));
  }

  /**
   * 重新激活当前 manager 对应 scope 的所有插件
   */
  public async restore(drizzle: DrizzleTransaction, app: Hono): Promise<void> {
    const installations = await drizzle
      .select({ pluginId: pluginInstallation.pluginId })
      .from(pluginInstallation)
      .where(
        and(
          eq(pluginInstallation.scopeType, this.scopeType),
          eq(pluginInstallation.scopeId, this.scopeId),
        ),
      );

    await Promise.all(
      installations.map(async ({ pluginId }) =>
        this.activate(drizzle, pluginId, app),
      ),
    );
  }

  /**
   * 激活插件\
   * 加载入点、注册内存服务、挂载路由、注册组件等
   */
  public async activate(
    drizzle: DrizzleTransaction,
    pluginId: string,
    app: Hono,
  ): Promise<void> {
    if (this.activePlugins.has(pluginId)) {
      logger.warn("PLUGIN", {
        msg: `Plugin ${pluginId} is already active definition.`,
      });
      return;
    }

    const loader = this.discovery.getLoader();
    // 确保定义是最新的
    await this.discovery.registerDefinition(drizzle, pluginId);

    // 检查并更新配置实例
    const configDef = await drizzle
      .select({ id: pluginConfig.id, schema: pluginConfig.schema })
      .from(pluginConfig)
      .where(eq(pluginConfig.pluginId, pluginId))
      .then((res) => res[0]);

    if (configDef) {
      const instance = await drizzle
        .select({
          id: pluginConfigInstance.id,
          value: pluginConfigInstance.value,
        })
        .from(pluginConfigInstance)
        .innerJoin(
          pluginInstallation,
          eq(pluginInstallation.id, pluginConfigInstance.pluginInstallationId),
        )
        .where(
          and(
            eq(pluginInstallation.pluginId, pluginId),
            eq(pluginInstallation.scopeId, this.scopeId),
            eq(pluginInstallation.scopeType, this.scopeType),
          ),
        )
        .then((res) => res[0]);

      if (instance) {
        const schema = JSONSchemaSchema.parse(configDef.schema);
        const defaults = getDefaultFromSchema(schema);

        // Ensure values are non-null objects before spreading
        const defaultsObj =
          defaults && typeof defaults === "object" && !Array.isArray(defaults)
            ? defaults
            : {};

        const instanceObj =
          instance.value &&
          typeof instance.value === "object" &&
          !Array.isArray(instance.value)
            ? instance.value
            : {};

        // Merge defaults and current value
        const newValue: JSONObject = {
          ...defaultsObj,
          ...instanceObj,
        };

        // 简单的深度比较可以通过 JSON.stringify (虽然不完美，但对配置对象通常足够)
        if (JSON.stringify(newValue) !== JSON.stringify(instance.value)) {
          logger.info("PLUGIN", {
            msg: `Updating config instance for ${pluginId}`,
          });
          await drizzle
            .update(pluginConfigInstance)
            .set({ value: newValue })
            .where(eq(pluginConfigInstance.id, instance.id));
        }
      }
    }

    const pluginObj = await loader.getInstance(pluginId);
    const config = await getPluginConfig(
      drizzle,
      pluginId,
      this.scopeType,
      this.scopeId,
    );

    // 当前上下文下已知的服务列表
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

    const context: PluginContext = {
      config,
      scopeType: this.scopeType,
      scopeId: this.scopeId,
      registeredServices,
    };

    // 执行激活钩子
    if (pluginObj.onActivate) {
      await pluginObj.onActivate(context);
    }

    // 注册 services
    if (pluginObj.services) {
      const services = await pluginObj.services(context);

      await this.serviceRegistry.combine(
        drizzle,
        this.scopeType,
        this.scopeId,
        pluginId,
        services,
      );
    }

    // 注册 components
    if (pluginObj.components) {
      const components = await pluginObj.components(context);
      this.componentRegistry.combine(
        pluginId,
        components.map((c) => ({ ...c, pluginId })),
      );
    }

    // 挂载 routes
    if (pluginObj.routes) {
      const route = new Hono();
      const baseURL = `/_plugin/${this.scopeType}/${this.scopeId}/${pluginId}`;
      await pluginObj.routes({ ...context, baseURL, app: route });
      app.route(baseURL, route);
    }

    this.activePlugins.set(pluginId, pluginObj);

    logger.info("PLUGIN", {
      msg: `Plugin ${pluginId} activated in ${this.scopeType}:${this.scopeId}`,
    });
  }

  public async deactivate(
    drizzle: DrizzleTransaction,
    pluginId: string,
  ): Promise<void> {
    const pluginObj = this.activePlugins.get(pluginId);
    if (!pluginObj) return;

    const config = await getPluginConfig(
      drizzle,
      pluginId,
      this.scopeType,
      this.scopeId,
    );

    // 执行停用钩子
    if (pluginObj.onDeactivate) {
      try {
        await pluginObj.onDeactivate({
          config,
          scopeType: this.scopeType,
          scopeId: this.scopeId,
          registeredServices: [],
        });
      } catch (e) {
        logger.error("PLUGIN", { msg: `Error deactivating ${pluginId}` }, e);
      }
    }

    // TODO 清理内存中注册的各种服务和组件等

    this.activePlugins.delete(pluginId);
  }

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
    return this.serviceRegistry.services;
  }

  public getServices<T extends PluginServiceType>(
    type: T,
  ): (RegisteredService & {
    service: PluginServiceMap[T];
  })[] {
    // oxlint-disable-next-line no-unsafe-type-assertion
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
}
