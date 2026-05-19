import * as yaml from "js-yaml";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import * as z from "zod";

import { interpolateEnvVars } from "./env-interpolation";
import {
  type DevSeedConfig,
  DevSeedConfigSchema,
  type ElementsSeed,
  ElementsSeedSchema,
  type GlossarySeed,
  GlossarySeedSchema,
  LocalSeedConfigSchema,
  type MemorySeed,
  MemorySeedSchema,
  type ProjectSeed,
  ProjectSeedSchema,
  type PluginOverride,
  type UserSeed,
  UserSeedSchema,
} from "./schemas";

/**
 * @zh 已加载的本地 seed 覆盖来源摘要，不包含配置值。
 * @en Summary of a loaded local seed override source, excluding config values.
 */
export type LoadedLocalSeedOverride = {
  path: string;
  pluginOverrideCount: number;
};

/**
 * @zh 加载开发 seed 时可选的本地覆盖配置。
 * @en Optional local override settings for loading a development seed.
 */
export type LoadDevSeedOptions = {
  localOverridePaths?: string[];
  ignoreMissingLocalOverrides?: boolean;
};

export type LoadedDevSeed = {
  config: DevSeedConfig;
  seedDir: string;
  localOverrideSources: LoadedLocalSeedOverride[];
  projectSeed: ProjectSeed;
  userSeed: UserSeed | undefined;
  glossarySeed: GlossarySeed | undefined;
  memorySeed: MemorySeed | undefined;
  elementsSeed: ElementsSeed | undefined;
};

export const readYamlWithEnv = <T>(
  filePath: string,
  schema: z.ZodType<T>,
  options: { preserveMissingEnv?: boolean } = {},
): T => {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw);
  const interpolated = interpolateEnvVars(parsed, {
    preserveMissing: options.preserveMissingEnv,
  });
  return schema.parse(interpolated);
};

export const readJson = <T>(filePath: string, schema: z.ZodType<T>): T => {
  const raw = readFileSync(filePath, "utf-8");
  return schema.parse(JSON.parse(raw));
};

const pluginOverrideKey = (override: PluginOverride): string =>
  [override.plugin, override.scope, override.scopeId ?? ""].join("\u0000");

const mergePluginOverrides = (
  base: PluginOverride[],
  overlay: PluginOverride[],
): PluginOverride[] => {
  const merged = [...base];
  const indexes = new Map<string, number>();

  for (const [index, override] of merged.entries()) {
    indexes.set(pluginOverrideKey(override), index);
  }

  for (const override of overlay) {
    const key = pluginOverrideKey(override);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, merged.length);
      merged.push(override);
    } else {
      merged[existingIndex] = override;
    }
  }

  return merged;
};

const applyLocalSeedOverrides = (
  seedDir: string,
  config: DevSeedConfig,
  options: LoadDevSeedOptions,
): { config: DevSeedConfig; sources: LoadedLocalSeedOverride[] } => {
  const ignoreMissing = options.ignoreMissingLocalOverrides ?? true;
  const sources: LoadedLocalSeedOverride[] = [];
  let pluginOverrides = config.plugins.overrides;

  for (const localOverridePath of options.localOverridePaths ?? []) {
    const absolutePath = isAbsolute(localOverridePath)
      ? localOverridePath
      : resolve(seedDir, localOverridePath);

    if (!existsSync(absolutePath)) {
      if (ignoreMissing) continue;
      throw new Error(`Local seed override file not found: ${absolutePath}`);
    }

    const localConfig = readYamlWithEnv(absolutePath, LocalSeedConfigSchema);
    pluginOverrides = mergePluginOverrides(
      pluginOverrides,
      localConfig.plugins.overrides,
    );
    sources.push({
      path: absolutePath,
      pluginOverrideCount: localConfig.plugins.overrides.length,
    });
  }

  return {
    config: {
      ...config,
      plugins: {
        ...config.plugins,
        overrides: pluginOverrides,
      },
    },
    sources,
  };
};

const UNRESOLVED_ENV_PATTERN = /\$\{[A-Za-z_][A-Za-z0-9_]*(?::-(.*?))?\}/;

const findUnresolvedEnvPath = (
  value: unknown,
  path: string,
): string | undefined => {
  if (typeof value === "string") {
    return UNRESOLVED_ENV_PATTERN.test(value) ? path : undefined;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const itemPath = findUnresolvedEnvPath(item, `${path}[${index}]`);
      if (itemPath) return itemPath;
    }
    return undefined;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const itemPath = findUnresolvedEnvPath(item, `${path}.${key}`);
      if (itemPath) return itemPath;
    }
  }
  return undefined;
};

const assertNoUnresolvedEnvVars = (config: DevSeedConfig): void => {
  const unresolvedPath = findUnresolvedEnvPath(config, "seed.yaml");
  if (!unresolvedPath) return;
  throw new Error(
    `Environment variable reference remains unresolved at ${unresolvedPath}. ` +
      "Set the variable, provide a default, or replace that entry with a local seed override.",
  );
};

export const loadDevSeed = (
  seedDir: string,
  options: LoadDevSeedOptions = {},
): LoadedDevSeed => {
  const abs = (rel: string) => resolve(seedDir, rel);

  const baseConfig = readYamlWithEnv(abs("seed.yaml"), DevSeedConfigSchema, {
    preserveMissingEnv: true,
  });
  const { config, sources } = applyLocalSeedOverrides(
    seedDir,
    baseConfig,
    options,
  );
  assertNoUnresolvedEnvVars(config);

  const projectSeed = readJson(abs(config.seed.project), ProjectSeedSchema);
  const userSeed = config.seed.users
    ? readJson(abs(config.seed.users), UserSeedSchema)
    : undefined;
  const glossarySeed = config.seed.glossary
    ? readJson(abs(config.seed.glossary), GlossarySeedSchema)
    : undefined;
  const memorySeed = config.seed.memory
    ? readJson(abs(config.seed.memory), MemorySeedSchema)
    : undefined;
  const elementsSeed = config.seed.elements
    ? readJson(abs(config.seed.elements), ElementsSeedSchema)
    : undefined;

  return {
    config,
    seedDir,
    localOverrideSources: sources,
    projectSeed,
    userSeed,
    glossarySeed,
    memorySeed,
    elementsSeed,
  };
};
