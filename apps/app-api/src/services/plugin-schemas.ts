import {
  PluginConfigInstanceSchema,
  PluginConfigSchema,
  PluginManifestSchema,
  PluginSchema,
  PluginServiceTypeSchema,
  ScopeTypeSchema,
  nonNullSafeZDotJson,
} from "@cat/shared";
import * as z from "zod";

/**
 * @zh 插件作用域输入参数 Schema。
 * @en Schema for plugin scope input parameters.
 */
export const PluginScopeInputSchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

/**
 * @zh 插件运行态状态枚举 Schema。
 * @en Schema for plugin runtime statuses.
 */
export const PluginRuntimeStatusSchema = z.enum([
  "NOT_INSTALLED",
  "INACTIVE",
  "ACTIVE",
  "DEGRADED",
]);

/**
 * @zh 插件检测状态枚举 Schema。
 * @en Schema for plugin probe statuses.
 */
export const PluginProbeStatusSchema = z.enum([
  "SUCCESS",
  "WARNING",
  "FAILED",
  "UNSUPPORTED",
  "UNAVAILABLE",
  "CANCELLED",
]);

/**
 * @zh 插件检测目标枚举 Schema。
 * @en Schema for plugin probe targets.
 */
export const PluginProbeTargetSchema = z.enum(["CANDIDATE", "RUNTIME"]);

/**
 * @zh 插件服务能力记录 Schema。
 * @en Schema for plugin capability service records.
 */
export const PluginCapabilityServiceSchema = z.object({
  serviceType: PluginServiceTypeSchema,
  serviceId: z.string(),
  source: z.enum(["MANIFEST", "DATABASE", "RUNTIME"]),
  dynamic: z.boolean().default(false),
  dbId: z.int().optional(),
  supportsProbe: z.boolean(),
  probeBillable: z.boolean(),
  probeRequiresInstall: z.boolean(),
  unsupportedReason: z.string().optional(),
});

/**
 * @zh 插件组件能力记录 Schema。
 * @en Schema for plugin capability component records.
 */
export const PluginCapabilityComponentSchema = z.object({
  componentId: z.string(),
  slot: z.string(),
  url: z.string(),
  source: z.enum(["MANIFEST", "RUNTIME"]),
});

/**
 * @zh 权限占位记录 Schema。
 * @en Schema for placeholder permission records.
 */
const PermissionRecordSchema = z.object({
  permission: z.string(),
  description: z.string(),
});

/**
 * @zh 插件配置详情 Schema。
 * @en Schema for plugin configuration details.
 */
export const PluginConfigDetailSchema = z.object({
  hasConfig: z.boolean(),
  schema: PluginConfigSchema.shape.schema.nullable(),
  config: PluginConfigSchema.nullable(),
  instance: PluginConfigInstanceSchema.nullable(),
  value: nonNullSafeZDotJson,
  expectedUpdatedAt: z.string().nullable(),
});

/**
 * @zh 插件详情读模型 Schema。
 * @en Schema for the plugin detail read model.
 */
export const PluginDetailSchema = z.object({
  plugin: PluginSchema,
  manifest: PluginManifestSchema.nullable(),
  manifestError: z.string().nullable(),
  installation: z.object({ id: z.int() }).nullable(),
  isInstalled: z.boolean(),
  runtimeStatus: PluginRuntimeStatusSchema,
  runtime: z.object({
    isActive: z.boolean(),
    hasRoute: z.boolean(),
    serviceAmount: z.int().min(0),
    componentAmount: z.int().min(0),
    lastError: z.string().nullable(),
  }),
  config: PluginConfigDetailSchema,
  capabilities: z.object({
    services: z.array(PluginCapabilityServiceSchema),
    components: z.array(PluginCapabilityComponentSchema),
    hasRuntimeRoute: z.boolean(),
    permissions: z.array(PermissionRecordSchema),
  }),
  actions: z.object({
    canInstall: z.boolean(),
    canUninstall: z.boolean(),
    canSaveConfig: z.boolean(),
    canReload: z.boolean(),
    canRetryApply: z.boolean(),
    canProbeCandidate: z.boolean(),
    canProbeRuntime: z.boolean(),
  }),
});

/**
 * @zh 插件动作状态枚举 Schema。
 * @en Schema for plugin action statuses.
 */
export const PluginActionStatusSchema = z.enum([
  "INSTALLED",
  "INSTALLED_NOT_ACTIVE",
  "UNINSTALLED",
  "RELOADED",
  "APPLIED",
  "NO_CONFIG",
  "ROLLED_BACK",
  "ROLLBACK_FAILED",
]);

/**
 * @zh 插件动作结果 Schema。
 * @en Schema for plugin action results.
 */
export const PluginActionResultSchema = z.object({
  status: PluginActionStatusSchema,
  message: z.string(),
  configInstance: PluginConfigInstanceSchema.nullable().optional(),
});

/**
 * @zh 保存并应用插件配置的输入 Schema。
 * @en Schema for saving and applying plugin configuration.
 */
export const SavePluginConfigAndApplyInputSchema =
  PluginScopeInputSchema.extend({
    value: nonNullSafeZDotJson,
    expectedUpdatedAt: z.iso.datetime().nullable().optional(),
  });

/**
 * @zh 插件配置检测输入 Schema。
 * @en Schema for plugin configuration probe input.
 */
export const ProbePluginConfigInputSchema = PluginScopeInputSchema.extend({
  target: PluginProbeTargetSchema,
  value: nonNullSafeZDotJson.optional(),
  serviceType: PluginServiceTypeSchema.optional(),
  timeoutMs: z.int().positive().max(15_000).optional(),
});

/**
 * @zh 插件检测错误 Schema。
 * @en Schema for plugin probe errors.
 */
export const PluginProbeErrorSchema = z.object({
  category: z.enum([
    "AUTH",
    "NETWORK",
    "TIMEOUT",
    "CANCELLED",
    "INVALID_RESPONSE",
    "UNSUPPORTED",
    "MISSING_CONFIG",
    "DISABLED_BY_RUNTIME",
    "REMOTE_UNREACHABLE",
    "UNKNOWN",
  ]),
  message: z.string(),
  httpStatus: z.int().optional(),
});

/**
 * @zh 单个插件服务检测结果 Schema。
 * @en Schema for a single plugin service probe result.
 */
export const PluginProbeServiceResultSchema = z.object({
  serviceType: PluginServiceTypeSchema,
  serviceId: z.string(),
  status: PluginProbeStatusSchema,
  billable: z.boolean(),
  latencyMs: z.number().nonnegative().nullable(),
  summary: nonNullSafeZDotJson,
  warnings: z.array(z.string()),
  error: PluginProbeErrorSchema.nullable(),
});

/**
 * @zh 插件检测汇总结果 Schema。
 * @en Schema for the aggregated plugin probe result.
 */
export const PluginProbeResultSchema = z.object({
  target: PluginProbeTargetSchema,
  overallStatus: PluginProbeStatusSchema,
  results: z.array(PluginProbeServiceResultSchema),
});

/**
 * @zh 插件作用域输入类型。
 * @en Type for plugin scope input.
 */
export type PluginScopeInput = z.infer<typeof PluginScopeInputSchema>;

/**
 * @zh 插件详情读模型类型。
 * @en Type for the plugin detail read model.
 */
export type PluginDetail = z.infer<typeof PluginDetailSchema>;

/**
 * @zh 插件动作结果类型。
 * @en Type for plugin action results.
 */
export type PluginActionResult = z.infer<typeof PluginActionResultSchema>;

/**
 * @zh 插件配置检测输入类型。
 * @en Type for plugin configuration probe input.
 */
export type ProbePluginConfigInput = z.infer<
  typeof ProbePluginConfigInputSchema
>;

/**
 * @zh 插件检测汇总结果类型。
 * @en Type for aggregated plugin probe results.
 */
export type PluginProbeResult = z.infer<typeof PluginProbeResultSchema>;

/**
 * @zh 单个插件服务检测结果类型。
 * @en Type for a single plugin service probe result.
 */
export type PluginProbeServiceResult = z.infer<
  typeof PluginProbeServiceResultSchema
>;
