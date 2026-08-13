import { bootstrapReceipt, eq, plugin, pluginConfig, sql } from "@cat/db";
import {
  ScopeTypeSchema,
  nonNullSafeZDotJson,
  type JSONType,
  type NonNullJSONType,
  type ScopeType,
  type _JSONSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

import { installPluginWithConfigIfAbsentInTransaction } from "./install-plugin-with-config-if-absent.cmd.ts";
import { getCanonicalDigest } from "./plugin-config-contract.ts";

const BootstrapPlanValueSchema = z.custom<NonNullJSONType>(
  (value) => nonNullSafeZDotJson.safeParse(value).success,
);

const BootstrapInstallIfAbsentOperationSchema = z.strictObject({
  type: z.literal("install-if-absent"),
  pluginId: z.string(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
  value: BootstrapPlanValueSchema,
});

export type BootstrapInstallIfAbsentOperation = {
  type: "install-if-absent";
  pluginId: string;
  scopeType: ScopeType;
  scopeId: string;
  value: NonNullJSONType;
};

export const BootstrapPlanSchema = z
  .strictObject({
    version: z.literal("1"),
    idempotencyKey: z.string().min(1),
    operations: z.array(BootstrapInstallIfAbsentOperationSchema).min(1),
  })
  .superRefine((plan, context) => {
    const seen = new Set<string>();
    for (const [index, operation] of plan.operations.entries()) {
      const key = `${operation.pluginId}:${operation.scopeType}:${operation.scopeId}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: "A bootstrap plan may install each plugin scope only once",
          path: ["operations", index],
        });
      }
      seen.add(key);
    }
  });

export type BootstrapPlan = z.infer<typeof BootstrapPlanSchema>;

export type ApplyBootstrapPlanResult = { status: "applied" | "noop" };

const sensitiveName =
  /(?:authorization|cookie|password|secret|token|api[-_]?key|credential)/i;

type SchemaObject = Record<string, unknown>;

const asSchemaObject = (schema: unknown): schema is SchemaObject =>
  schema !== null && typeof schema === "object" && !Array.isArray(schema);

const resolveLocalReference = (
  root: SchemaObject,
  reference: string,
): SchemaObject | undefined => {
  if (!reference.startsWith("#/")) return undefined;
  const segments = reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = root;
  for (const segment of segments) {
    if (!asSchemaObject(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return asSchemaObject(current) ? current : undefined;
};

const assertNonSecretBootstrapSchema = (schema: _JSONSchema): void => {
  if (!asSchemaObject(schema)) {
    throw new Error(
      "Bootstrap plan cannot prove config is a non-secret configuration schema",
    );
  }
  const root = schema;
  const visited = new Set<object>();
  const visit = (definition: SchemaObject, path: string): void => {
    if (visited.has(definition)) return;
    visited.add(definition);

    if (
      definition.writeOnly === true ||
      definition["x-secret"] === true ||
      definition.secret === true
    ) {
      throw new Error(
        `Bootstrap plan cannot persist secret configuration at ${path}`,
      );
    }

    if (typeof definition.$dynamicRef === "string") {
      throw new Error(
        `Bootstrap plan cannot prove dynamic reference ${definition.$dynamicRef} is non-secret`,
      );
    }
    if (definition.patternProperties !== undefined) {
      throw new Error(
        `Bootstrap plan cannot prove dynamic property names at ${path} are non-secret`,
      );
    }
    if (
      definition.type === "object" &&
      (definition.additionalProperties === undefined ||
        definition.additionalProperties === true)
    ) {
      throw new Error(
        `Bootstrap plan cannot prove ${path}.additionalProperties is non-secret`,
      );
    }
    if (
      definition.type === "array" &&
      definition.items === undefined &&
      definition.prefixItems === undefined
    ) {
      throw new Error(
        `Bootstrap plan cannot prove unconstrained array items at ${path} are non-secret`,
      );
    }

    const reference = definition.$ref;
    if (typeof reference === "string") {
      const resolved = resolveLocalReference(root, reference);
      if (!resolved) {
        throw new Error(
          `Bootstrap plan cannot prove external reference ${reference} is non-secret`,
        );
      }
      visit(resolved, `${path}.$ref`);
    }

    const properties = definition.properties;
    if (properties !== undefined) {
      if (
        properties === null ||
        typeof properties !== "object" ||
        Array.isArray(properties)
      ) {
        throw new Error(
          `Bootstrap plan cannot prove ${path}.properties is non-secret`,
        );
      }
      for (const [name, propertySchema] of Object.entries(properties)) {
        if (sensitiveName.test(name)) {
          throw new Error(
            `Bootstrap plan cannot persist secret configuration at ${path}.properties.${name}`,
          );
        }
        if (!asSchemaObject(propertySchema)) {
          throw new Error(
            `Bootstrap plan cannot prove ${path}.properties.${name} is non-secret`,
          );
        }
        visit(propertySchema, `${path}.properties.${name}`);
      }
    }

    const childSchemas = [
      "items",
      "contains",
      "additionalProperties",
      "unevaluatedProperties",
      "propertyNames",
      "if",
      "then",
      "else",
      "not",
      "contentSchema",
    ];
    for (const key of childSchemas) {
      const child = definition[key];
      if (child === undefined || child === false) continue;
      if (child === true) {
        throw new Error(
          `Bootstrap plan cannot prove ${path}.${key} is non-secret`,
        );
      }
      if (!asSchemaObject(child)) {
        throw new Error(
          `Bootstrap plan cannot prove ${path}.${key} is non-secret`,
        );
      }
      visit(child, `${path}.${key}`);
    }

    for (const key of ["prefixItems", "allOf", "anyOf", "oneOf"] as const) {
      const children = definition[key];
      if (children === undefined) continue;
      if (!Array.isArray(children)) {
        throw new Error(
          `Bootstrap plan cannot prove ${path}.${key} is non-secret`,
        );
      }
      for (const [index, child] of children.entries()) {
        if (!asSchemaObject(child)) {
          throw new Error(
            `Bootstrap plan cannot prove ${path}.${key}[${index}] is non-secret`,
          );
        }
        visit(child, `${path}.${key}[${index}]`);
      }
    }

    for (const definitionsKey of ["$defs", "definitions"] as const) {
      const definitions = definition[definitionsKey];
      if (definitions === undefined) continue;
      if (
        definitions === null ||
        typeof definitions !== "object" ||
        Array.isArray(definitions)
      ) {
        throw new Error(
          `Bootstrap plan cannot prove ${path}.${definitionsKey} is non-secret`,
        );
      }
      for (const [name, child] of Object.entries(definitions)) {
        if (!asSchemaObject(child)) {
          throw new Error(
            `Bootstrap plan cannot prove ${path}.${definitionsKey}.${name} is non-secret`,
          );
        }
        visit(child, `${path}.${definitionsKey}.${name}`);
      }
    }

    const dependentSchemas = definition.dependentSchemas;
    if (dependentSchemas !== undefined) {
      if (!asSchemaObject(dependentSchemas)) {
        throw new Error(
          `Bootstrap plan cannot prove ${path}.dependentSchemas is non-secret`,
        );
      }
      for (const [name, child] of Object.entries(dependentSchemas)) {
        if (!asSchemaObject(child)) {
          throw new Error(
            `Bootstrap plan cannot prove ${path}.dependentSchemas.${name} is non-secret`,
          );
        }
        visit(child, `${path}.dependentSchemas.${name}`);
      }
    }
  };

  visit(root, "config");
};

const assertNonSecretBootstrapValue = (value: NonNullJSONType): void => {
  const visit = (candidate: JSONType, path: string): void => {
    if (Array.isArray(candidate)) {
      for (const [index, child] of candidate.entries()) {
        visit(child, `${path}[${index}]`);
      }
      return;
    }
    if (candidate === null || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate)) {
      if (sensitiveName.test(key)) {
        throw new Error(
          `Bootstrap plan cannot persist secret configuration value at ${path}.${key}`,
        );
      }
      visit(child, `${path}.${key}`);
    }
  };

  visit(value, "config");
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.cause !== undefined) return errorMessage(error.cause);
    return error.message;
  }
  return String(error);
};

export const applyBootstrapPlan: Command<
  BootstrapPlan,
  ApplyBootstrapPlanResult
> = async (ctx, command) => {
  const plan = BootstrapPlanSchema.parse(command);
  const inputDigest = getCanonicalDigest(plan);
  const result = await ctx.db.transaction(async (tx) => {
    await tx.execute(
      // Serialise an absent-receipt check as well as a present-receipt retry.
      // The unique constraint remains the durable receipt identity.
      sql`SELECT pg_advisory_xact_lock(hashtext(${plan.idempotencyKey}))`,
    );
    const [existingReceipt] = await tx
      .select({ inputDigest: bootstrapReceipt.inputDigest })
      .from(bootstrapReceipt)
      .where(eq(bootstrapReceipt.idempotencyKey, plan.idempotencyKey))
      .limit(1);
    if (existingReceipt) {
      if (existingReceipt.inputDigest !== inputDigest) {
        throw new Error(
          "Bootstrap plan idempotency key was already used with different input",
        );
      }
      return { status: "noop" } as const;
    }

    const applied = [] as Array<{
      pluginId: string;
      pluginVersion: string;
      schemaDigest: string;
      schemaVersion: string;
    }>;
    for (const operation of plan.operations) {
      const [configDefinition] = await tx
        .select({ schema: pluginConfig.schema })
        .from(pluginConfig)
        .where(eq(pluginConfig.pluginId, operation.pluginId))
        .limit(1);
      if (!configDefinition) {
        throw new Error(
          `Plugin ${operation.pluginId} has no available configuration definition`,
        );
      }
      assertNonSecretBootstrapSchema(configDefinition.schema);
      assertNonSecretBootstrapValue(operation.value);
      const install = await installPluginWithConfigIfAbsentInTransaction(
        tx,
        operation,
      );
      if (install.status === "existing") {
        throw new Error(
          `Bootstrap plan cannot overwrite ${operation.pluginId}: unmanaged installation already exists`,
        );
      }
      const [pluginDefinition] = await tx
        .select({ version: plugin.version })
        .from(plugin)
        .where(eq(plugin.id, operation.pluginId))
        .limit(1);
      if (!pluginDefinition) {
        throw new Error(
          `Plugin ${operation.pluginId} disappeared during bootstrap`,
        );
      }
      applied.push({
        pluginId: operation.pluginId,
        pluginVersion: pluginDefinition.version,
        schemaDigest: install.schemaDigest,
        schemaVersion: install.schemaVersion,
      });
    }

    try {
      await tx.insert(bootstrapReceipt).values({
        idempotencyKey: plan.idempotencyKey,
        planVersion: plan.version,
        inputDigest,
        schemaDigest: getCanonicalDigest(
          applied.map(({ pluginId, schemaDigest, schemaVersion }) => ({
            pluginId,
            schemaDigest,
            schemaVersion,
          })),
        ),
        pluginDigest: getCanonicalDigest(
          applied.map(({ pluginId, pluginVersion }) => ({
            pluginId,
            pluginVersion,
          })),
        ),
      });
    } catch (error) {
      throw new Error(
        `Bootstrap receipt persistence failed: ${errorMessage(error)}`,
        { cause: error },
      );
    }
    return { status: "applied" } as const;
  });

  return { result, events: [] };
};
