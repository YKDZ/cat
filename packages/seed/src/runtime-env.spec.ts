import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadSeedRuntimeEnv } from "@/runtime-env";

describe("loadSeedRuntimeEnv", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "seed-runtime-env-"));
    await mkdir(dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("prefers env-file database and redis URLs over stale process values", async () => {
    const envFilePath = join(dir, ".env");
    await writeFile(
      envFilePath,
      [
        'DATABASE_URL="postgresql://user:pass@172.17.0.1:25432/cat?schema=public"',
        'REDIS_URL="redis://172.17.0.1:26379"',
      ].join("\n"),
      "utf8",
    );

    const env: NodeJS.ProcessEnv = {
      DATABASE_URL:
        "postgresql://user:pass@172.17.0.1:5432/cat_e2e?schema=public",
      REDIS_URL: "redis://172.17.0.1:6379",
      VECTORIZER_URL: "http://shell-vectorizer.test/v1",
    };

    const result = loadSeedRuntimeEnv({ envFilePaths: [envFilePath], env });

    expect(result).toEqual({
      loadedEnvFilePath: envFilePath,
      loadedPreferredKeys: ["DATABASE_URL", "REDIS_URL"],
    });
    expect(env.DATABASE_URL).toBe(
      "postgresql://user:pass@172.17.0.1:25432/cat?schema=public",
    );
    expect(env.REDIS_URL).toBe("redis://172.17.0.1:26379");
    expect(env.VECTORIZER_URL).toBe("http://shell-vectorizer.test/v1");
  });

  it("keeps current process values when preferred keys are opted out", async () => {
    const envFilePath = join(dir, ".env");
    await writeFile(
      envFilePath,
      'DATABASE_URL="postgresql://user:pass@172.17.0.1:25432/cat?schema=public"\n',
      "utf8",
    );

    const env: NodeJS.ProcessEnv = {
      DATABASE_URL:
        "postgresql://user:pass@172.17.0.1:5432/cat_e2e?schema=public",
    };

    const result = loadSeedRuntimeEnv({
      envFilePaths: [envFilePath],
      env,
      preferredKeys: [],
    });

    expect(result).toEqual({
      loadedEnvFilePath: envFilePath,
      loadedPreferredKeys: [],
    });
    expect(env.DATABASE_URL).toBe(
      "postgresql://user:pass@172.17.0.1:5432/cat_e2e?schema=public",
    );
  });
});
