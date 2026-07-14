import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");
const productionCompose = resolve(root, "apps/app/compose.yaml");
const localCompose = resolve(root, "apps/app/compose.local.yaml");
const temporaryDirectories: string[] = [];

const composeEnvironment = {
  CAT_POSTGRES_DB: "cat",
  CAT_POSTGRES_PASSWORD: "postgres /#@: password",
  CAT_POSTGRES_USER: "cat",
  CAT_REDIS_PASSWORD: "redis /#@: password",
};

const runComposeConfig = async (file: string): Promise<string> => {
  const child = spawn(
    "docker",
    [
      "compose",
      "-f",
      file,
      "--project-directory",
      resolve(file, ".."),
      "config",
      "--format",
      "json",
    ],
    {
      cwd: resolve(file, ".."),
      env: {
        HOME: process.env.HOME ?? tmpdir(),
        PATH: process.env.PATH ?? "",
        ...composeEnvironment,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let error = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    error += chunk;
  });
  const [code] = await once(child, "close");
  expect(code, error).toBe(0);
  return output;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe("Compose deployment contracts", () => {
  it("keeps the canonical local Compose entry visible in a clean checkout", async () => {
    await expect(readFile(localCompose, "utf8")).resolves.toContain(
      "name: cat-local",
    );
  });

  it("publishes a self-contained standalone deployment with ordered core lifecycle services", async () => {
    const raw = await readFile(productionCompose, "utf8");
    expect(raw).not.toMatch(/^\s*(build|configs|extends|include):/mu);
    expect(raw).not.toContain("../");
    expect(raw).not.toContain("./");

    const compose = parse(raw) as {
      services: Record<string, Record<string, unknown>>;
    };
    expect(compose.services).toEqual(
      expect.objectContaining({
        app: expect.objectContaining({ command: ["prepare-and-start"] }),
        bootstrap: expect.objectContaining({ command: ["bootstrap-only"] }),
        postgresql: expect.objectContaining({}),
        prepare: expect.objectContaining({ command: ["prepare-only"] }),
        redis: expect.objectContaining({}),
        spacy: expect.objectContaining({}),
      }),
    );
    expect(Object.keys(compose.services)).not.toEqual(
      expect.arrayContaining(["ollama", "libretranslate"]),
    );
    expect(compose.services.prepare).toEqual(
      expect.objectContaining({
        depends_on: expect.objectContaining({
          postgresql: { condition: "service_healthy" },
          redis: { condition: "service_healthy" },
          spacy: { condition: "service_healthy" },
        }),
      }),
    );
    expect(compose.services.bootstrap).toEqual(
      expect.objectContaining({
        depends_on: {
          prepare: { condition: "service_completed_successfully" },
        },
      }),
    );
    expect(compose.services.app).toEqual(
      expect.objectContaining({
        depends_on: {
          bootstrap: { condition: "service_completed_successfully" },
        },
      }),
    );

    const resolved = JSON.parse(await runComposeConfig(productionCompose)) as {
      services: Record<string, Record<string, unknown>>;
      volumes: Record<string, unknown>;
    };
    for (const service of Object.values(resolved.services)) {
      expect(service).not.toHaveProperty("build");
      expect(service).not.toHaveProperty("extends");
      expect(service).not.toHaveProperty("configs");
      expect(JSON.stringify(service)).not.toContain('type":"bind');
      expect(service.image).toEqual(expect.any(String));
    }
    expect(resolved.volumes).toEqual(
      expect.objectContaining({
        "cat-data": expect.any(Object),
        "postgresql-data": expect.any(Object),
        "redis-data": expect.any(Object),
      }),
    );
    for (const name of ["prepare", "bootstrap", "app"]) {
      const service = resolved.services[name];
      expect(service).toMatchObject({
        read_only: true,
        tmpfs: ["/tmp:rw,nosuid,nodev,noexec,mode=1777"],
        user: "1001:1001",
        volumes: expect.arrayContaining([
          expect.objectContaining({ source: "cat-data", target: "/data" }),
        ]),
      });
      expect(service).not.toHaveProperty("environment.DATABASE_URL");
      expect(service).not.toHaveProperty("environment.REDIS_URL");
      expect(service.environment).toMatchObject({
        CAT_RUNTIME_PROFILE: "production",
      });
    }
    expect(resolved.services.prepare).not.toHaveProperty(
      "environment.CAT_BOOTSTRAP_PLAN",
    );
    expect(resolved.services.app).not.toHaveProperty(
      "environment.CAT_BOOTSTRAP_PLAN",
    );
    expect(resolved.services.bootstrap?.environment).toHaveProperty(
      "CAT_BOOTSTRAP_PLAN",
    );
    expect(resolved.services.redis).toMatchObject({
      environment: { REDIS_PASSWORD: composeEnvironment.CAT_REDIS_PASSWORD },
    });
    expect(JSON.stringify(resolved.services.redis.healthcheck)).toContain(
      "REDIS_PASSWORD",
    );
  });

  it("remains valid after the production artifact is copied outside the repository", async () => {
    const directory = await mkdtemp(
      resolve(tmpdir(), "cat-production-compose-"),
    );
    temporaryDirectories.push(directory);
    const copied = resolve(directory, "compose.yaml");
    await cp(productionCompose, copied);

    await expect(runComposeConfig(copied)).resolves.toContain('"app"');
  });

  it("keeps local and disposable E2E policies in separate entries over shared service templates", async () => {
    const local = resolve(root, "apps/app/compose.local.yaml");
    const e2e = resolve(root, "apps/app-e2e/compose.e2e.yaml");
    const template = resolve(root, "apps/app/compose.services.yaml");

    for (const file of [local, e2e]) {
      const raw = await readFile(file, "utf8");
      expect(raw).toContain("extends:");
      await expect(runComposeConfig(file)).resolves.toContain('"postgresql"');
    }
    await expect(runComposeConfig(template)).resolves.toContain('"spacy"');

    const localResolved = JSON.parse(await runComposeConfig(local)) as {
      name: string;
      services: Record<
        string,
        {
          environment?: Record<string, string>;
          ports?: Array<{ host_ip?: string }>;
          restart?: string;
          security_opt?: string[];
        }
      >;
    };
    const e2eResolved = JSON.parse(await runComposeConfig(e2e)) as {
      name: string;
      services: Record<
        string,
        {
          environment?: Record<string, string>;
          ports?: Array<{ host_ip?: string }>;
          restart?: string;
          security_opt?: string[];
        }
      >;
    };
    expect(localResolved.name).toBe("cat-local");
    expect(e2eResolved.name).toBe("cat-e2e");
    expect(localResolved.services.postgresql?.ports).not.toEqual(
      e2eResolved.services.postgresql?.ports,
    );
    for (const resolved of [localResolved, e2eResolved]) {
      for (const name of ["postgresql", "redis", "spacy"]) {
        const service = resolved.services[name];
        expect(service?.ports).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ host_ip: "127.0.0.1" }),
          ]),
        );
        expect(service?.security_opt).toContain("no-new-privileges:true");
      }
    }
    expect(localResolved.services.redis?.environment).toMatchObject({
      REDIS_PASSWORD: "cat-local-redis",
    });
    expect(e2eResolved.services.redis?.environment).toMatchObject({
      REDIS_PASSWORD: "cat-e2e-redis",
    });
    expect(localResolved.services.postgresql?.restart).toBe("unless-stopped");
    expect(e2eResolved.services.postgresql?.restart).toBe("no");
    for (const service of ["postgresql", "redis", "spacy"]) {
      expect(e2eResolved.services[service]?.labels).toMatchObject({
        "cat.test-service-lease.token": "unowned",
      });
    }
    expect(e2eResolved.volumes).toEqual(
      expect.objectContaining({
        "e2e-postgresql-data": expect.objectContaining({
          labels: { "cat.test-service-lease.token": "unowned" },
        }),
        "e2e-redis-data": expect.objectContaining({
          labels: { "cat.test-service-lease.token": "unowned" },
        }),
      }),
    );
  });
});
