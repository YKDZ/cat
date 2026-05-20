import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const DEFAULT_PREFERRED_ENV_KEYS = ["DATABASE_URL", "REDIS_URL"] as const;

/**
 * @zh Seeder 运行时环境加载选项。
 * @en Options for loading seeder runtime environment variables.
 */
export type SeedRuntimeEnvOptions = {
  /**
   * @zh 按优先级尝试加载的 env 文件路径。
   * @en Env file paths to try in priority order.
   */
  envFilePaths: readonly string[];

  /**
   * @zh 需要优先采用 env 文件值的环境变量键。
   * @en Environment variable keys that should prefer values from the env file.
   */
  preferredKeys?: readonly string[];

  /**
   * @zh 要写入的环境对象，默认使用 `process.env`。
   * @en Environment object to mutate. Defaults to `process.env`.
   */
  env?: NodeJS.ProcessEnv;
};

/**
 * @zh Seeder 运行时环境加载结果。
 * @en Result of loading seeder runtime environment variables.
 */
export type SeedRuntimeEnvLoadResult = {
  /**
   * @zh 实际加载的 env 文件路径；若未命中则为 `undefined`。
   * @en The env file path that was actually loaded, or `undefined` when none matched.
   */
  loadedEnvFilePath?: string;

  /**
   * @zh 本次由 env 文件强制接管的优先键列表。
   * @en Preferred keys that were explicitly taken from the env file this time.
   */
  loadedPreferredKeys: string[];
};

/**
 * @zh 从优先 env 文件加载 seeder 运行时环境，并让数据库/缓存地址默认以文件值为准。
 * @en Load seeder runtime env from preferred env files and make database/cache addresses prefer file values by default.
 *
 * @param options - {@zh 加载选项} {@en Load options}
 * @returns - {@zh 加载结果} {@en Load result}
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
