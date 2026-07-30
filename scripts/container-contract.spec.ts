import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const temporaryDirectories: string[] = [];

const run = async (
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number | null; stderr: string; stdout: string }> => {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const [code] = await once(child, "close");
  return { code: code as number | null, stderr, stdout };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("application container contract", () => {
  it("assembles both modes from one root-owned application runtime", async () => {
    const dockerfile = await readFile(
      resolve(root, "apps/app/Dockerfile"),
      "utf8",
    );
    const stages = [
      ...dockerfile.matchAll(/^FROM\s+(.+?)\s+AS\s+(\S+)$/gim),
    ].map(([, parent, name]) => ({ name, parent }));

    expect(stages).toEqual(
      expect.arrayContaining([
        {
          name: "application-runtime",
          parent: expect.stringMatching(
            /^node:24\.\d+\.\d+-bookworm-slim@sha256:[a-f0-9]{64}$/,
          ),
        },
        { name: "database-preparation", parent: "application-runtime" },
        { name: "standalone", parent: "database-preparation" },
        { name: "runtime", parent: "application-runtime" },
      ]),
    );
    expect(dockerfile).toContain("pnpm --filter @cat/app deploy --prod");
    expect(dockerfile).not.toContain("--legacy");
    expect(dockerfile).not.toContain("m" + "oon");
    expect(dockerfile).not.toMatch(/COPY\s+--from=build\s+--chown=/);
    expect(dockerfile.startsWith("# syntax=docker/dockerfile:1\n")).toBe(true);
    expect(dockerfile).toContain("COPY --parents apps/*/package.json");
    expect(dockerfile).toContain("packages/*/package.json");
    expect(dockerfile).toContain("@cat-plugin/*/package.json");
    expect(dockerfile).not.toContain("COPY packages packages");
    expect(dockerfile).toContain("pnpm exec turbo prune @cat/app --docker");
    expect(dockerfile).toContain("pnpm install --filter=cat-root");
    expect(dockerfile).toContain("pnpm install --frozen-lockfile\n");
    expect(dockerfile).not.toContain(
      "pnpm install --frozen-lockfile --ignore-scripts\nCOPY --from=pruner /repo/out/full",
    );
    expect(dockerfile).toContain("COPY --from=pruner /repo/out/json/ ./");
    expect(dockerfile).toContain("COPY --from=pruner /repo/out/full/ ./");
    expect(dockerfile).toContain("pnpm exec turbo run build --filter=@cat/app");
    expect(dockerfile).not.toContain("pnpm build-plugins");
    for (const secret of [
      "turbo_team",
      "turbo_token",
      "turbo_remote_cache_signature_key",
    ]) {
      expect(dockerfile).toContain(`--mount=type=secret,id=${secret}`);
    }
    expect(dockerfile).not.toContain("--build-arg TURBO_");
  });

  it("filters credentials, persistent data, daemon state, and build caches before context transfer", async () => {
    const ignore = await readFile(
      resolve(root, "apps/app/Dockerfile.dockerignore"),
      "utf8",
    );
    const rules = new Set(
      ignore
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#")),
    );

    for (const rule of [
      "**/.env",
      "**/.env.*",
      "apps/app/storage",
      "**/.docker",
      "**/.pnpm-store",
      "**/.turbo",
      "**/node_modules",
      "**/build",
      "**/out",
    ]) {
      expect(rules.has(rule), `missing Docker context rule ${rule}`).toBe(true);
    }
    expect(rules.has("tools/**")).toBe(true);
    expect(rules.has("!tools/*/package.json")).toBe(true);
  });

  it("checks the real application readiness route", async () => {
    let requestedPath: string | undefined;
    const server = createServer((request, response) => {
      requestedPath = request.url;
      response.writeHead(request.url === "/_health/ready" ? 200 : 404).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("Could not allocate health contract port");
    }

    try {
      const result = await run(
        process.execPath,
        [resolve(root, "apps/app/scripts/docker-health-check.js")],
        { env: { PORT: String(address.port) } },
      );
      expect(result.code).toBe(0);
      expect(requestedPath).toBe("/_health/ready");
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("exposes only each target's inherent lifecycle commands", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "cat-entrypoint-"));
    temporaryDirectories.push(directory);
    const node = resolve(directory, "node");
    await writeFile(node, "#!/bin/sh\nprintf '%s\\n' \"$*\"\n", "utf8");
    await chmod(node, 0o755);
    const standaloneEntrypoint = resolve(
      root,
      "apps/app/scripts/container-entrypoint-standalone.sh",
    );
    const runtimeEntrypoint = resolve(
      root,
      "apps/app/scripts/container-entrypoint-runtime.sh",
    );
    const env = {
      PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
    };

    const prepare = await run("sh", [standaloneEntrypoint, "prepare-only"], {
      env,
    });
    expect(prepare).toMatchObject({
      code: 0,
      stdout:
        "/usr/local/bin/container-runner.mjs node /app/.preparation/prepare-database.mjs\n",
    });

    const bootstrap = await run(
      "sh",
      [standaloneEntrypoint, "bootstrap-only"],
      {
        env,
      },
    );
    expect(bootstrap).toMatchObject({
      code: 0,
      stdout:
        "/usr/local/bin/container-runner.mjs node /app/dist/bootstrap-only/bootstrap-only-cli.js\n",
    });

    const prepareAndStart = await run(
      "sh",
      [standaloneEntrypoint, "prepare-and-start"],
      { env },
    );
    expect(prepareAndStart).toMatchObject({
      code: 0,
      stdout: [
        "/usr/local/bin/container-runner.mjs node /app/.preparation/prepare-database.mjs",
        "/usr/local/bin/container-runner.mjs node /app/dist/bootstrap-only/bootstrap-only-cli.js",
        "/usr/local/bin/container-runner.mjs node /app/dist/server/index.mjs",
        "",
      ].join("\n"),
    });

    const start = await run("sh", [runtimeEntrypoint, "start-only"], { env });
    expect(start).toMatchObject({
      code: 0,
      stdout:
        "/usr/local/bin/container-runner.mjs node /app/dist/server/index.mjs\n",
    });

    for (const command of [
      "prepare-only",
      "bootstrap-only",
      "prepare-and-start",
    ]) {
      const rejected = await run("sh", [runtimeEntrypoint, command], { env });
      expect(rejected.code, command).toBe(64);
      expect(rejected.stderr, command).toContain(
        `does not support '${command}'`,
      );
    }

    const standaloneRejected = await run(
      "sh",
      [standaloneEntrypoint, "start-only"],
      { env },
    );
    expect(standaloneRejected.code).toBe(64);
    expect(standaloneRejected.stderr).toContain(
      "Expected prepare-only, bootstrap-only, or prepare-and-start.",
    );
  });

  it("encodes connection component credentials before starting an application process", async () => {
    const runner = resolve(root, "apps/app/scripts/container-runner.mjs");
    const result = await run(
      process.execPath,
      [
        runner,
        process.execPath,
        "-e",
        "process.stdout.write(JSON.stringify({database:process.env.DATABASE_URL,redis:process.env.REDIS_URL}))",
      ],
      {
        env: {
          CAT_DATABASE_HOST: "postgresql",
          CAT_DATABASE_NAME: "cat",
          CAT_DATABASE_PASSWORD: "db /#@:",
          CAT_DATABASE_USER: "cat",
          CAT_REDIS_HOST: "redis",
          CAT_REDIS_PASSWORD: "redis /#@:",
        },
      },
    );
    expect(result.code, result.stderr).toBe(0);
    const urls = JSON.parse(result.stdout) as {
      database: string;
      redis: string;
    };
    const database = new URL(urls.database);
    const redis = new URL(urls.redis);
    expect(decodeURIComponent(database.password)).toBe("db /#@:");
    expect(decodeURIComponent(redis.password)).toBe("redis /#@:");
    expect(urls.database).not.toContain("db /#@:");
    expect(urls.redis).not.toContain("redis /#@:");
  });

  it("keeps one full-suite dev E2E configuration without an app preview runner", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(root, "apps/app/package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(manifest.scripts?.preview).toBeUndefined();
    expect(manifest.scripts?.["bootstrap:local"]).toContain(
      "scripts/bootstrap-local.mjs",
    );

    const e2eManifest = JSON.parse(
      await readFile(resolve(root, "apps/app-e2e/package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(e2eManifest.scripts?.["test:e2e"]).toContain("test-e2e.ts");
    expect(e2eManifest.scripts?.["test:e2e"]).not.toContain(
      "playwright.dev.config.ts",
    );
    const playwrightConfig = await readFile(
      resolve(root, "apps/app-e2e/playwright.config.ts"),
      "utf8",
    );
    expect(playwrightConfig).toContain('testDir: "./tests"');
    expect(playwrightConfig).not.toContain('CAT_DEV_DB_PUSH: "false"');
    await expect(
      readFile(resolve(root, "apps/app-e2e/playwright.dev.config.ts"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });

    const executionCell = await readFile(
      resolve(root, "apps/app-e2e/execution-cell.ts"),
      "utf8",
    );
    expect(executionCell).toContain("class ExecutionCell");
    expect(executionCell).toContain('"bootstrap-only"');
    expect(executionCell).toContain("CAT_BOOTSTRAP_PLAN");
    expect(executionCell).toContain("createCellDatabase");
  });

  it("keeps standalone, schema, and development artifacts outside the runtime release", async () => {
    const dockerfile = await readFile(
      resolve(root, "apps/app/Dockerfile"),
      "utf8",
    );

    expect(dockerfile).toContain("/application-release");
    expect(dockerfile).toContain("/standalone-deployment");
    expect(dockerfile).not.toContain("CONTAINER_CAPABILITY");
    expect(dockerfile).toContain("container-entrypoint-runtime.sh");
    expect(dockerfile).toContain("container-entrypoint-standalone.sh");
    expect(dockerfile).toContain("rm -rf /application-release/scripts");
    expect(dockerfile).toContain("/application-release/compose.yaml");
  });

  it("keeps disposable E2E services in the canonical lease Compose entry", async () => {
    const compose = await readFile(
      resolve(root, "apps/app-e2e/compose.e2e.yaml"),
      "utf8",
    );
    expect(compose).toContain("CAT_E2E_POSTGRES_HOST_PORT:-0");
    expect(compose).toContain("CAT_E2E_REDIS_HOST_PORT:-0");
    expect(compose).toContain("CAT_E2E_SPACY_HOST_PORT:-0");
    await expect(
      readFile(resolve(root, "scripts/check-all.compose.yml"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
