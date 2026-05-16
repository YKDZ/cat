import {
  executeCommand,
  executeQuery,
  getPlugin,
  getPluginConfig,
  getPluginConfigInstance,
  getPluginInstallation,
  listPluginServicesForInstallation,
  updatePluginConfigInstanceValue,
  updatePluginConfigInstanceValueIfUnchanged,
  upsertPluginConfigInstance,
} from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import {
  JSONSchemaSchema,
  type NonNullJSONType,
  getDefaultFromSchema,
} from "@cat/shared";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import type { Context } from "@/utils/context";

import type {
  PluginActionResult,
  PluginDetail,
  PluginScopeInput,
} from "./plugin-schemas";

const BILLABLE_SERVICE_TYPES = new Set([
  "LLM_PROVIDER",
  "TEXT_VECTORIZER",
  "RERANK_PROVIDER",
  "TRANSLATION_ADVISOR",
]);

const PROBABLE_SERVICE_TYPES = new Set([
  "LLM_PROVIDER",
  "TEXT_VECTORIZER",
  "RERANK_PROVIDER",
  "STORAGE_PROVIDER",
  "TRANSLATION_ADVISOR",
  "NLP_WORD_SEGMENTER",
]);

const degradedRuntimeStates = new Map<string, string>();

const runtimeStateKey = (input: PluginScopeInput): string => {
  return `${input.scopeType}:${input.scopeId}:${input.pluginId}`;
};

const unsupportedProbeReason = (serviceType: string): string | undefined => {
  if (serviceType === "EMAIL_PROVIDER") {
    return "邮件服务不执行通用检测，以避免误发邮件。";
  }
  if (serviceType === "VECTOR_STORAGE") {
    return "向量存储没有通用的低副作用检测方式。";
  }
  if (!PROBABLE_SERVICE_TYPES.has(serviceType)) {
    return "此服务类型没有平台内置通用检测。";
  }
  return undefined;
};

const defaultConfigValue = (
  schema: PluginDetail["config"]["schema"],
): NonNullJSONType => {
  if (!schema) return {};
  const parsed = JSONSchemaSchema.parse(schema);
  const defaults = getDefaultFromSchema(parsed);
  if (defaults !== null && defaults !== undefined) return defaults;
  if (typeof parsed !== "boolean" && parsed.type === "array") return [];
  return {};
};

const toRuntimeStatus = (
  isInstalled: boolean,
  isActive: boolean,
  isDegraded: boolean,
): PluginDetail["runtimeStatus"] => {
  if (!isInstalled) return "NOT_INSTALLED";
  if (isDegraded) return "DEGRADED";
  return isActive ? "ACTIVE" : "INACTIVE";
};

const safeLoaderCall = async <T>(
  fn: () => Promise<T>,
): Promise<{
  value: T | null;
  error: string | null;
}> => {
  try {
    return { value: await fn(), error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "插件 Manifest 读取失败";
    return { value: null, error: message };
  }
};

const runtimeErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "插件运行态重载失败";
  return message
    .replace(/\b(Bearer\s+)([^\s,;"']+)/gi, "$1[REDACTED]")
    .replace(
      /\b(api[-_ ]?key|authorization|token|password|secret|secret[-_ ]?access[-_ ]?key|access[-_ ]?key)([\s:=]+)(Bearer\s+)?([^\s,;"']+)/gi,
      (_match, key: string, separator: string, bearer: string | undefined) =>
        `${key}${separator}${bearer ?? ""}[REDACTED]`,
    );
};

/**
 * @zh 构建插件详情页所需的读模型。
 * @en Build the read model required by the plugin detail page.
 *
 * @param context - {@zh 当前请求上下文} {@en Current request context}
 * @param input - {@zh 插件作用域输入} {@en Plugin scope input}
 * @returns - {@zh 插件详情读模型，不存在时为 null} {@en Plugin detail read model, or null when the plugin does not exist}
 */
export const getPluginDetailModel = async (
  context: Context,
  input: PluginScopeInput,
): Promise<PluginDetail | null> => {
  const {
    drizzleDB: { client: drizzle },
  } = context;
  const manager = PluginManager.get(input.scopeType, input.scopeId);

  const plugin = await executeQuery({ db: drizzle }, getPlugin, {
    pluginId: input.pluginId,
  });
  if (!plugin) return null;

  const [config, installation, manifestResult] = await Promise.all([
    executeQuery({ db: drizzle }, getPluginConfig, {
      pluginId: input.pluginId,
    }),
    executeQuery({ db: drizzle }, getPluginInstallation, input),
    safeLoaderCall(async () => manager.getLoader().getManifest(input.pluginId)),
  ]);

  // Current manifest and DB schemas do not expose plugin permission declarations.
  // Keep the field stable for the UI, but do not invent a persistence source here.
  const permissions: PluginDetail["capabilities"]["permissions"] = [];

  const isInstalled = installation !== null;
  const configInstance =
    isInstalled && config
      ? await executeQuery({ db: drizzle }, getPluginConfigInstance, input)
      : null;
  const dbServices = isInstalled
    ? await executeQuery(
        { db: drizzle },
        listPluginServicesForInstallation,
        input,
      )
    : [];
  const runtime = manager.getRuntimeSnapshot(input.pluginId);
  const degradedMessage =
    degradedRuntimeStates.get(runtimeStateKey(input)) ?? null;

  const manifestServices = manifestResult.value?.services ?? [];
  const serviceMap = new Map<
    string,
    PluginDetail["capabilities"]["services"][number]
  >();

  for (const service of manifestServices) {
    const serviceId = service.id ?? "dynamic";
    const reason = unsupportedProbeReason(service.type);
    serviceMap.set(`${service.type}:${serviceId}:MANIFEST`, {
      serviceType: service.type,
      serviceId,
      source: "MANIFEST",
      dynamic: service.dynamic ?? false,
      supportsProbe: reason === undefined,
      probeBillable: BILLABLE_SERVICE_TYPES.has(service.type),
      probeRequiresInstall: false,
      unsupportedReason: reason,
    });
  }

  for (const service of dbServices) {
    const reason = unsupportedProbeReason(service.type);
    serviceMap.set(`${service.type}:${service.id}:DATABASE`, {
      serviceType: service.type,
      serviceId: service.id,
      source: "DATABASE",
      dbId: service.dbId,
      dynamic: !manifestServices.some(
        (manifestService) =>
          manifestService.id === service.id &&
          manifestService.type === service.type,
      ),
      supportsProbe: reason === undefined,
      probeBillable: BILLABLE_SERVICE_TYPES.has(service.type),
      probeRequiresInstall: false,
      unsupportedReason: reason,
    });
  }

  for (const service of runtime.services) {
    const reason = unsupportedProbeReason(service.type);
    serviceMap.set(`${service.type}:${service.id}:RUNTIME`, {
      serviceType: service.type,
      serviceId: service.id,
      source: "RUNTIME",
      dbId: service.dbId,
      dynamic: true,
      supportsProbe: reason === undefined,
      probeBillable: BILLABLE_SERVICE_TYPES.has(service.type),
      probeRequiresInstall: true,
      unsupportedReason: reason,
    });
  }

  const manifestComponents = (manifestResult.value?.components ?? []).map(
    (component) => ({
      componentId: component.id,
      slot: component.slot,
      url: component.url,
      source: "MANIFEST" as const,
    }),
  );

  const runtimeComponents = runtime.components.map((component) => ({
    componentId: component.name,
    slot: component.slot,
    url: component.url,
    source: "RUNTIME" as const,
  }));

  const schema = config?.schema ?? null;
  const value = configInstance?.value ?? defaultConfigValue(schema);
  const hasProbeableService = [...serviceMap.values()].some(
    (service) => service.supportsProbe,
  );

  return {
    plugin,
    manifest: manifestResult.value,
    manifestError: manifestResult.error,
    installation,
    isInstalled,
    runtimeStatus: toRuntimeStatus(
      isInstalled,
      runtime.isActive,
      degradedMessage !== null,
    ),
    runtime: {
      isActive: runtime.isActive,
      hasRoute: runtime.hasRoute,
      serviceAmount: runtime.services.length,
      componentAmount: runtime.components.length,
      lastError: degradedMessage,
    },
    config: {
      hasConfig: config !== null,
      schema,
      config,
      instance: configInstance,
      value,
      expectedUpdatedAt: configInstance?.updatedAt.toISOString() ?? null,
    },
    capabilities: {
      services: [...serviceMap.values()],
      components: [...manifestComponents, ...runtimeComponents],
      hasRuntimeRoute: runtime.hasRoute,
      permissions,
    },
    actions: {
      canInstall: !isInstalled,
      canUninstall: isInstalled,
      canSaveConfig: isInstalled && config !== null,
      canReload: isInstalled,
      canRetryApply: isInstalled && degradedMessage !== null,
      canProbeCandidate: config !== null && hasProbeableService,
      canProbeRuntime: runtime.isActive && hasProbeableService,
    },
  };
};

/**
 * @zh 按插件 JSON Schema 校验配置值。
 * @en Validate a configuration value against the plugin JSON Schema.
 *
 * @param schema - {@zh 插件配置 Schema} {@en Plugin configuration schema}
 * @param value - {@zh 待校验的配置值} {@en Configuration value to validate}
 * @returns - {@zh 无返回；校验失败时抛出错误} {@en No return value; throws when validation fails}
 */
export const assertConfigValueMatchesSchema = (
  schema: PluginDetail["config"]["schema"],
  value: NonNullJSONType,
): void => {
  if (!schema) return;
  const zodSchema = z.fromJSONSchema(JSONSchemaSchema.parse(schema));
  const result = zodSchema.safeParse(value);
  if (!result.success) {
    throw new ORPCError("BAD_REQUEST", {
      message: "插件配置校验失败",
      data: { issues: result.error.issues.map((issue) => issue.message) },
    });
  }
};

/**
 * @zh 将插件安装到指定作用域并尽力激活。
 * @en Install a plugin into the target scope and attempt to activate it.
 *
 * @param context - {@zh 当前请求上下文} {@en Current request context}
 * @param input - {@zh 插件作用域输入} {@en Plugin scope input}
 * @returns - {@zh 结构化安装结果} {@en Structured installation result}
 */
export const installPluginToScope = async (
  context: Context,
  input: PluginScopeInput,
): Promise<PluginActionResult> => {
  const {
    drizzleDB: { client: drizzle },
  } = context;
  const manager = PluginManager.get(input.scopeType, input.scopeId);

  await manager.install(drizzle, input.pluginId);

  try {
    await manager.activate(drizzle, input.pluginId);
    degradedRuntimeStates.delete(runtimeStateKey(input));
    return { status: "INSTALLED", message: "插件已安装并激活" };
  } catch {
    return {
      status: "INSTALLED_NOT_ACTIVE",
      message: "插件已安装，但激活失败。数据已保留，可稍后重试。",
    };
  }
};

/**
 * @zh 从指定作用域卸载插件。
 * @en Uninstall a plugin from the target scope.
 *
 * @param context - {@zh 当前请求上下文} {@en Current request context}
 * @param input - {@zh 插件作用域输入} {@en Plugin scope input}
 * @returns - {@zh 结构化卸载结果} {@en Structured uninstall result}
 */
export const uninstallPluginFromScope = async (
  context: Context,
  input: PluginScopeInput,
): Promise<PluginActionResult> => {
  const {
    drizzleDB: { client: drizzle },
  } = context;
  const manager = PluginManager.get(input.scopeType, input.scopeId);

  await manager.deactivate(drizzle, input.pluginId);
  await drizzle.transaction(async (tx) => {
    await manager.uninstall(tx, input.pluginId);
  });
  degradedRuntimeStates.delete(runtimeStateKey(input));

  return { status: "UNINSTALLED", message: "插件已卸载" };
};

/**
 * @zh 使用长期数据库句柄重载插件运行态。
 * @en Reload the plugin runtime using a long-lived database handle.
 *
 * @param context - {@zh 当前请求上下文} {@en Current request context}
 * @param input - {@zh 插件作用域输入} {@en Plugin scope input}
 * @returns - {@zh 结构化重载结果} {@en Structured reload result}
 */
export const reloadPluginRuntime = async (
  context: Context,
  input: PluginScopeInput,
): Promise<PluginActionResult> => {
  const {
    drizzleDB: { client: drizzle },
  } = context;
  const manager = PluginManager.get(input.scopeType, input.scopeId);

  try {
    await manager.reloadPlugin(drizzle, input.pluginId);
    degradedRuntimeStates.delete(runtimeStateKey(input));
    return { status: "RELOADED", message: "插件已重载" };
  } catch (error) {
    const message = runtimeErrorMessage(error);
    degradedRuntimeStates.set(runtimeStateKey(input), message);
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message });
  }
};

/**
 * @zh 保存插件配置并尝试热应用；失败时回滚旧值。
 * @en Save plugin configuration and attempt hot-apply; roll back to the previous value on failure.
 *
 * @param context - {@zh 当前请求上下文} {@en Current request context}
 * @param input - {@zh 插件配置保存与应用输入} {@en Input for saving and applying plugin configuration}
 * @returns - {@zh 结构化保存/应用结果} {@en Structured save/apply result}
 */
export const savePluginConfigAndApply = async (
  context: Context,
  input: PluginScopeInput & {
    value: NonNullJSONType;
    expectedUpdatedAt?: string | null;
  },
): Promise<PluginActionResult> => {
  const {
    drizzleDB: { client: drizzle },
    user,
  } = context;
  const manager = PluginManager.get(input.scopeType, input.scopeId);
  const detail = await getPluginDetailModel(context, input);

  if (!detail) {
    throw new ORPCError("NOT_FOUND", { message: "插件不存在" });
  }
  if (!detail.isInstalled) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "插件必须先安装才能保存配置",
    });
  }
  if (!detail.config.hasConfig || !detail.config.schema) {
    return { status: "NO_CONFIG", message: "插件未声明配置项" };
  }

  assertConfigValueMatchesSchema(detail.config.schema, input.value);

  const oldInstance = detail.config.instance;
  const oldValue =
    oldInstance?.value ?? defaultConfigValue(detail.config.schema);
  const expectedUpdatedAt = input.expectedUpdatedAt;

  let savedInstance = oldInstance;
  if (oldInstance && !expectedUpdatedAt) {
    throw new ORPCError("PRECONDITION_FAILED", {
      message: "保存已有配置时必须携带配置版本，请刷新后重试。",
    });
  }

  if (oldInstance) {
    const expectedUpdatedAtValue = expectedUpdatedAt;
    if (!expectedUpdatedAtValue) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "保存已有配置时必须携带配置版本，请刷新后重试。",
      });
    }
    const updated = await executeCommand(
      { db: drizzle },
      updatePluginConfigInstanceValueIfUnchanged,
      {
        instanceId: oldInstance.id,
        expectedUpdatedAt: new Date(expectedUpdatedAtValue),
        value: input.value,
      },
    );
    if (!updated) {
      throw new ORPCError("CONFLICT", {
        message: "插件配置已被其他请求修改，请刷新后重试。",
      });
    }
    savedInstance = updated;
  } else {
    savedInstance = await executeCommand(
      { db: drizzle },
      upsertPluginConfigInstance,
      {
        pluginId: input.pluginId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        creatorId: user!.id,
        value: input.value,
      },
    );
  }

  try {
    await manager.reloadPlugin(drizzle, input.pluginId);
    degradedRuntimeStates.delete(runtimeStateKey(input));
    return {
      status: "APPLIED",
      message: "插件配置已保存并应用",
      configInstance: savedInstance,
    };
  } catch {
    if (!savedInstance) {
      degradedRuntimeStates.set(
        runtimeStateKey(input),
        "配置保存失败：未获得配置实例",
      );
      return {
        status: "ROLLBACK_FAILED",
        message: "配置保存失败：未获得配置实例",
      };
    }

    try {
      await executeCommand({ db: drizzle }, updatePluginConfigInstanceValue, {
        instanceId: savedInstance.id,
        value: oldValue,
      });
      await manager.reloadPlugin(drizzle, input.pluginId);
      degradedRuntimeStates.delete(runtimeStateKey(input));
      return {
        status: "ROLLED_BACK",
        message: "插件配置应用失败，已恢复旧配置",
      };
    } catch {
      degradedRuntimeStates.set(
        runtimeStateKey(input),
        "插件配置应用失败，自动回滚也失败",
      );
      return {
        status: "ROLLBACK_FAILED",
        message: "插件配置应用失败，自动回滚也失败",
      };
    }
  }
};
