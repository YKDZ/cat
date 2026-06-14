import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const DEFAULT_PREFERRED_ENV_KEYS = ["DATABASE_URL", "REDIS_URL"] as const;

/**
 * Options for loading seeder runtime environment variables.
 */
export type SeedRuntimeEnvOptions = {
  /**
   * Env file paths to try in priority order.
   */
  envFilePaths: readonly string[];

  /**
   * Environment variable keys that should prefer values from the env file.
   */
  preferredKeys?: readonly string[];

  /**
   * Environment object to mutate. Defaults to `process.env`.
   */
  env?: NodeJS.ProcessEnv;
};

/**
 * Result of loading seeder runtime environment variables.
 */
export type SeedRuntimeEnvLoadResult = {
  /**
   * The env file path that was actually loaded, or `undefined` when none matched.
   */
  loadedEnvFilePath?: string;

  /**
   * Preferred keys that were explicitly taken from the env file this time.
   */
  loadedPreferredKeys: string[];
};

/**
 * Load seeder runtime env from preferred env files and make database/cache addresses prefer file values by default.
 *
 * @param options - Load options
 * @returns - Load result
 */
export const loadSeedRuntimeEnv = (
  options: SeedRuntimeEnvOptions,
): SeedRuntimeEnvLoadResult => {
  const env = options.env ?? process.env;
  const preferredKeySet = new Set(
    options.preferredKeys ?? DEFAULT_PREFERRED_ENV_KEYS,
  );

  for (const envFilePath of options.envFilePaths) {
    if (!existsSync(envFilePath)) continue;

    const parsedEnv = parseEnv(readFileSync(envFilePath, "utf8"));
    const loadedPreferredKeys: string[] = [];

    for (const [key, value] of Object.entries(parsedEnv)) {
      if (preferredKeySet.has(key) || env[key] === undefined) {
        env[key] = value;
      }
      if (preferredKeySet.has(key) && parsedEnv[key] !== undefined) {
        loadedPreferredKeys.push(key);
      }
    }

    return {
      loadedEnvFilePath: envFilePath,
      loadedPreferredKeys,
    };
  }

  return {
    loadedPreferredKeys: [],
  };
};
