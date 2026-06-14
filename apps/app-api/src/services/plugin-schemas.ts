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
 * Schema for plugin scope input parameters.
 */
export const PluginScopeInputSchema = z.object({
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
});

/**
 * Schema for plugin runtime statuses.
 */
export const PluginRuntimeStatusSchema = z.enum([
  "NOT_INSTALLED",
  "INACTIVE",
  "ACTIVE",
  "DEGRADED",
]);

/**
 * Schema for plugin probe statuses.
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
 * Schema for plugin probe targets.
 */
export const PluginProbeTargetSchema = z.enum(["CANDIDATE", "RUNTIME"]);

/**
 * Schema for plugin capability service records.
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
 * Schema for plugin capability component records.
 */
export const PluginCapabilityComponentSchema = z.object({
  componentId: z.string(),
  slot: z.string(),
  url: z.string(),
  source: z.enum(["MANIFEST", "RUNTIME"]),
});

/**
 * Schema for placeholder permission records.
 */
const PermissionRecordSchema = z.object({
  permission: z.string(),
  description: z.string(),
});

/**
 * Schema for plugin configuration details.
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
 * Schema for the plugin detail read model.
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
 * Schema for plugin action statuses.
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
 * Schema for plugin action results.
 */
export const PluginActionResultSchema = z.object({
  status: PluginActionStatusSchema,
  message: z.string(),
  configInstance: PluginConfigInstanceSchema.nullable().optional(),
});

/**
 * Schema for saving and applying plugin configuration.
 */
export const SavePluginConfigAndApplyInputSchema =
  PluginScopeInputSchema.extend({
    value: nonNullSafeZDotJson,
    expectedUpdatedAt: z.iso.datetime().nullable().optional(),
  });

/**
 * Schema for plugin configuration probe input.
 */
export const ProbePluginConfigInputSchema = PluginScopeInputSchema.extend({
  target: PluginProbeTargetSchema,
  value: nonNullSafeZDotJson.optional(),
  serviceType: PluginServiceTypeSchema.optional(),
  timeoutMs: z.int().positive().max(15_000).optional(),
});

/**
 * Schema for plugin probe errors.
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
 * Schema for a single plugin service probe result.
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
 * Schema for the aggregated plugin probe result.
 */
export const PluginProbeResultSchema = z.object({
  target: PluginProbeTargetSchema,
  overallStatus: PluginProbeStatusSchema,
  results: z.array(PluginProbeServiceResultSchema),
});

/**
 * Type for plugin scope input.
 */
export type PluginScopeInput = z.infer<typeof PluginScopeInputSchema>;

/**
 * Type for the plugin detail read model.
 */
export type PluginDetail = z.infer<typeof PluginDetailSchema>;

/**
 * Type for plugin action results.
 */
export type PluginActionResult = z.infer<typeof PluginActionResultSchema>;

/**
 * Type for plugin configuration probe input.
 */
export type ProbePluginConfigInput = z.infer<
  typeof ProbePluginConfigInputSchema
>;

/**
 * Type for aggregated plugin probe results.
 */
export type PluginProbeResult = z.infer<typeof PluginProbeResultSchema>;

/**
 * Type for a single plugin service probe result.
 */
export type PluginProbeServiceResult = z.infer<
  typeof PluginProbeServiceResultSchema
>;
