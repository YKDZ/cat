import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

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
    ]) {
      expect(rules.has(rule), `missing Docker context rule ${rule}`).toBe(true);
    }
  });

  it("checks the real application health route", async () => {
    let requestedPath: string | undefined;
    const server = createServer((request, response) => {
      requestedPath = request.url;
      response.writeHead(request.url === "/_health" ? 200 : 404).end();
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
      expect(requestedPath).toBe("/_health");
    } finally {
      server.close();
      await once(server, "close");
    }
  });

  it("executes mode commands and rejects unsupported preparation with EX_USAGE", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "cat-entrypoint-"));
    temporaryDirectories.push(directory);
    const node = resolve(directory, "node");
    await writeFile(node, "#!/bin/sh\nprintf '%s\\n' \"$*\"\n", "utf8");
    await chmod(node, 0o755);
    const entrypoint = resolve(
      root,
      "apps/app/scripts/container-entrypoint.sh",
    );
    const env = {
      PATH: `${directory}${delimiter}${process.env.PATH ?? ""}`,
      PREPARE_DATABASE_COMMAND: "/app/.preparation/prepare-database.mjs",
    };

    const prepare = await run("sh", [entrypoint, "prepare-only"], {
      env: { ...env, CONTAINER_CAPABILITY: "prepare-and-start" },
    });
    expect(prepare).toMatchObject({
      code: 0,
      stdout: "/app/.preparation/prepare-database.mjs\n",
    });

    const rejected = await run("sh", [entrypoint, "prepare-only"], {
      env: { ...env, CONTAINER_CAPABILITY: "start-only" },
    });
    expect(rejected.code).toBe(64);
    expect(rejected.stderr).toContain("does not support 'prepare-only'");
  });

  it("publishes loopback services for socket clients and keeps Redis disposable", async () => {
    const compose: unknown = parse(
      await readFile(resolve(root, "scripts/check-all.compose.yml"), "utf8"),
    );
    expect(compose).toMatchObject({
      services: {
        postgresql: {
          ports: ["${CAT_CHECK_ALL_BIND_HOST:-127.0.0.1}:0:5432"],
        },
        redis: {
          cap_drop: ["ALL"],
          command: expect.arrayContaining([
            "redis-server",
            "--appendonly",
            "no",
            "--save",
            "",
            "--requirepass",
            "${CAT_CHECK_ALL_REDIS_PASSWORD:?required}",
          ]),
          ports: ["${CAT_CHECK_ALL_BIND_HOST:-127.0.0.1}:0:6379"],
          read_only: true,
          security_opt: ["no-new-privileges:true"],
          tmpfs: ["/data"],
        },
      },
    });
  });
});
