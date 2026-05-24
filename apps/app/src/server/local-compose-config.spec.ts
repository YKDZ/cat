import { parse as parseDotenv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "../..");

const readText = (relativePath: string): string => {
  return readFileSync(resolve(appRoot, relativePath), "utf8");
};

const readOptionalText = (relativePath: string): string | null => {
  const absolutePath = resolve(appRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
};

const normalizeDbUrl = (value: string): string => {
  return value.replace(/^postgresql:/u, "postgres:");
};

const requireEnvValue = (env: Record<string, string>, key: string): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing ${key} in env fixture`);
  }
  return value;
};

const extractComposeDefaultPort = (
  composeText: string,
  variableName: string,
  containerPort: number,
): string => {
  const pattern = new RegExp(
    String.raw`\$\{${variableName}:-([0-9]+)\}:${containerPort}`,
    "u",
  );
  const match = composeText.match(pattern);
  expect(match?.[1]).toBeTruthy();
  return match![1];
};

describe("local docker compose config", () => {
  it("keeps local PostgreSQL/Redis ports isolated from e2e defaults and in sync with app env files", () => {
    const composeText = readText("docker-compose.local.yml");
    const envExample = parseDotenv(readText(".env.example"));
    const dbEnvExample = parseDotenv(
      readText("../../packages/db/.env.example"),
    );
    const optionalLocalEnvs = [
      readOptionalText(".env"),
      readOptionalText("../../packages/db/.env"),
      readOptionalText("../../.env"),
    ]
      .filter((text) => text !== null)
      .map((text) => parseDotenv(text));

    expect(composeText).toMatch(/^name:\s*cat-local$/mu);
    expect(composeText).not.toMatch(/^\s*container_name:/mu);

    const postgresPort = extractComposeDefaultPort(
      composeText,
      "CAT_LOCAL_POSTGRES_HOST_PORT",
      5432,
    );
    const redisPort = extractComposeDefaultPort(
      composeText,
      "CAT_LOCAL_REDIS_HOST_PORT",
      6379,
    );
    const libreTranslatePort = extractComposeDefaultPort(
      composeText,
      "CAT_LOCAL_LIBRETRANSLATE_HOST_PORT",
      5000,
    );
    const spacyPort = extractComposeDefaultPort(
      composeText,
      "CAT_LOCAL_SPACY_HOST_PORT",
      8000,
    );

    expect(postgresPort).not.toBe("5432");
    expect(redisPort).not.toBe("6379");
    expect(libreTranslatePort).not.toBe("5000");
    expect(spacyPort).not.toBe("8000");

    expect(
      new URL(normalizeDbUrl(requireEnvValue(envExample, "DATABASE_URL"))).port,
    ).toBe(postgresPort);
    expect(new URL(requireEnvValue(envExample, "REDIS_URL")).port).toBe(
      redisPort,
    );
    expect(
      new URL(normalizeDbUrl(requireEnvValue(dbEnvExample, "DATABASE_URL")))
        .port,
    ).toBe(postgresPort);

    for (const localEnv of optionalLocalEnvs) {
      if (localEnv.DATABASE_URL) {
        expect(new URL(normalizeDbUrl(localEnv.DATABASE_URL)).port).toBe(
          postgresPort,
        );
      }
      if (localEnv.TEST_DATABASE_URL) {
        expect(new URL(normalizeDbUrl(localEnv.TEST_DATABASE_URL)).port).toBe(
          postgresPort,
        );
      }
      if (localEnv.REDIS_URL) {
        expect(new URL(localEnv.REDIS_URL).port).toBe(redisPort);
      }
    }
  });
});
