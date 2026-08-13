import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "../../../..");
const dockerComposeConfigTimeoutMs = 20_000;

const applicationComposeFiles = [
  "apps/app/compose.yaml",
  "apps/app/compose.local.yaml",
  "apps/app-e2e/compose.e2e.yaml",
] as const;

const evalSuiteComposeFiles = [
  "apps/eval/suites/smoke/compose.eval.yaml",
  "apps/eval/suites/minecraft-term-recall/compose.eval.yaml",
  "apps/eval/suites/minecraft-memory-recall/compose.eval.yaml",
  "apps/eval/suites/minecraft-agent-translate/compose.eval.yaml",
  "apps/eval/suites/minecraft-quality/compose.eval.yaml",
  "apps/eval/suites/recall-rerank/compose.eval.yaml",
] as const;

type RedisService = {
  command?: string[];
  image?: string;
};

type ComposeConfig = {
  services?: {
    redis?: RedisService;
  };
};

const readText = (relativePath: string): string => {
  return readFileSync(resolve(root, relativePath), "utf8");
};

const renderComposeConfig = (relativePath: string): ComposeConfig => {
  const file = resolve(root, relativePath);
  const output = execFileSync(
    "docker",
    [
      "compose",
      "-f",
      file,
      "--project-directory",
      dirname(file),
      "config",
      "--format",
      "json",
    ],
    {
      cwd: dirname(file),
      encoding: "utf8",
      env: {
        ...process.env,
        CAT_POSTGRES_DB: "cat",
        CAT_POSTGRES_PASSWORD: "postgres-password",
        CAT_POSTGRES_USER: "cat",
        CAT_REDIS_PASSWORD: "redis-password",
        CAT_SPACY_IMAGE_ID: "sha256:test-spacy-image",
      },
      timeout: 15_000,
    },
  );
  return JSON.parse(output) as ComposeConfig;
};

const expectAofCommand = (redis: RedisService | undefined): void => {
  expect(redis?.command?.slice(0, 5)).toEqual([
    "redis-server",
    "--appendonly",
    "yes",
    "--appendfsync",
    "everysec",
  ]);
};

describe("Redis AOF compose config", () => {
  it.each(applicationComposeFiles)(
    "%s enables appendonly yes and appendfsync everysec on services.redis.command",
    (relativePath) => {
      const compose = renderComposeConfig(relativePath);

      expectAofCommand(compose.services?.redis);
    },
    dockerComposeConfigTimeoutMs,
  );

  it.each(evalSuiteComposeFiles)(
    "%s includes the shared evaluation services without redeclaring Redis",
    (relativePath) => {
      const compose = parse(readText(relativePath)) as {
        include?: string[];
        services?: Record<string, unknown>;
      };

      expect(compose.include).toEqual(["../../compose.services.yaml"]);
      expect(compose.services).toBeUndefined();
    },
  );

  it.each(evalSuiteComposeFiles)(
    "%s renders the shared Redis service with AOF enabled",
    (relativePath) => {
      const compose = renderComposeConfig(relativePath);

      expectAofCommand(compose.services?.redis);
    },
    dockerComposeConfigTimeoutMs,
  );

  it(
    "keeps the application Redis capability on the official image",
    () => {
      const compose = renderComposeConfig("apps/app/compose.services.yaml");

      expect(compose.services?.redis?.image).toBe("redis:8-alpine");
    },
    dockerComposeConfigTimeoutMs,
  );
});
