import type { AppRouter } from "@cat/app-api/orpc/router";
import type { RouterClient } from "@orpc/server";

import { createClient } from "./rpc.ts";

/**
 * @zh CLI 全局配置。
 * @en CLI global configuration.
 */
export type CliConfig = {
  apiUrl: string;
  apiKey: string;
  client: RouterClient<AppRouter>;
};

/**
 * @zh 从 CLI 参数和环境变量解析全局配置。优先使用命令行参数。
 * @en Resolve global config from CLI args and env vars. CLI args take precedence.
 */
export const resolveConfig = (values: Record<string, unknown>): CliConfig => {
  const apiUrl =
    (typeof values["api-url"] === "string" ? values["api-url"] : null) ??
    process.env["CAT_API_URL"] ??
    "http://localhost:3000";

  const apiKey =
    (typeof values["api-key"] === "string" ? values["api-key"] : null) ??
    process.env["CAT_API_KEY"] ??
    "";

  if (!apiKey) {
    // oxlint-disable-next-line no-console
    console.error(
      "[ERROR] MISSING_API_KEY: No API key provided.\n" +
        "  hint: Set --api-key <key> or export CAT_API_KEY=cat_...",
    );
    process.exit(1);
  }

  return {
    apiUrl,
    apiKey,
    client: createClient(apiUrl, apiKey),
  };
};
