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
const serviceCompose = resolve(root, "apps/app/compose.services.yaml");
const spacyDockerfile = resolve(root, "apps/spacy-server/Dockerfile");
const spacyStartupBudget = resolve(
  root,
  "apps/spacy-server/src/startup_budget.py",
);
const testServiceLease = resolve(root, "apps/app-e2e/test-service-lease.ts");
const evalCompose = resolve(root, "apps/eval/compose.services.yaml");
const releaseEvalCompose = resolve(
  root,
  "apps/eval/suites/release-recall/compose.eval.yaml",
);
const temporaryDirectories: string[] = [];

const composeEnvironment = {
  CAT_POSTGRES_DB: "cat",
  CAT_POSTGRES_PASSWORD: "postgres /#@: password",
  CAT_POSTGRES_USER: "cat",
  CAT_REDIS_PASSWORD: "redis /#@: password",
};

type ComposeService = Record<string, unknown> & {
  environment?: Record<string, string>;
  healthcheck?: unknown;
  labels?: Record<string, string>;
  ports?: Array<{ host_ip?: string }>;
  restart?: string;
  security_opt?: string[];
};

type ComposeConfig = {
  name?: string;
  services: Record<string, ComposeService>;
  volumes: Record<string, unknown>;
};

const runComposeConfig = async (
  file: string,
  profiles: readonly string[] = [],
  environment: Record<string, string> = {},
): Promise<string> => {
  const child = spawn(
    "docker",
    [
      "compose",
      "-f",
      file,
      "--project-directory",
      resolve(file, ".."),
      ...profiles.flatMap((profile) => ["--profile", profile]),
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
        ...environment,
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
  it("keeps the spaCy service wait budget above every bounded cold-start phase", async () => {
    const budget = await readFile(spacyStartupBudget, "utf8");
    const timeout = (name: string): number => {
      const value = budget.match(
        new RegExp(`^${name} = (\\d+)\\.0$`, "m"),
      )?.[1];
      if (value === undefined) throw new Error(`Missing ${name}`);
      return Number(value);
    };
    const boundedPhaseSeconds =
      timeout("PROVISION_TIMEOUT_SECONDS") +
      timeout("RUNTIME_VALIDATION_TIMEOUT_SECONDS") +
      timeout("WORKER_START_TIMEOUT_SECONDS");
    const serviceStartupSeconds =
      boundedPhaseSeconds + timeout("SERVICE_STARTUP_MARGIN_SECONDS");
    const composeDuration = `${Math.floor(serviceStartupSeconds / 60)}m${serviceStartupSeconds % 60}s`;

    expect(boundedPhaseSeconds).toBe(480);
    expect(serviceStartupSeconds).toBe(510);
    expect(budget).toContain("+ SERVICE_STARTUP_MARGIN_SECONDS");
    await expect(readFile(testServiceLease, "utf8")).resolves.toContain(
      `const spacyServiceStartupTimeoutSeconds = ${serviceStartupSeconds};`,
    );
    const services = parse(
      await readFile(serviceCompose, "utf8"),
    ) as ComposeConfig;
    expect(services.services.spacy?.healthcheck).toMatchObject({
      start_period: `${serviceStartupSeconds}s`,
    });
    const production = JSON.parse(
      await runComposeConfig(productionCompose),
    ) as ComposeConfig;
    expect(production.services.spacy?.healthcheck).toMatchObject({
      start_period: composeDuration,
    });
    await expect(readFile(spacyDockerfile, "utf8")).resolves.toContain(
      `--start-period=${serviceStartupSeconds}s`,
    );
  });

  it("keeps eval services pinned, source-image based, and compatible with the shared lifecycle contract", async () => {
    const resolved = JSON.parse(
      await runComposeConfig(evalCompose, [], {
        CAT_SPACY_IMAGE_ID: "sha256:eval-spacy-image",
      }),
    ) as ComposeConfig;

    expect(resolved.services.postgresql).toMatchObject({
      image: "pgvector/pgvector:0.8.6-pg18",
    });
    expect(resolved.services.redis).toMatchObject({
      image:
        "redis:8.8.0-alpine@sha256:9d317178eceac8454a2284a9e6df2466b93c745529947f0cd42a0fa9609d7005",
    });
    expect(resolved.services.spacy).toMatchObject({
      image: "sha256:eval-spacy-image",
      read_only: true,
      user: "10001:10001",
    });
    expect(resolved.services.ollama).toMatchObject({
      image: "ollama/ollama:0.16.1",
    });
    for (const service of Object.values(resolved.services)) {
      expect(service).not.toHaveProperty("build");
      expect(service).not.toHaveProperty("extends");
      expect(service.restart).toBe("no");
      expect(service.security_opt).toContain("no-new-privileges:true");
      for (const port of service.ports ?? []) {
        expect(port.host_ip).toBe("127.0.0.1");
      }
    }
    expect(JSON.stringify(resolved.services.postgresql?.healthcheck)).toContain(
      "pg_isready",
    );
    expect(
      JSON.stringify(resolved.services.postgresql?.healthcheck),
    ).not.toContain("psql");
  });

  it("resolves the release recall suite Compose entry through the shared eval capability contract", async () => {
    const resolved = JSON.parse(
      await runComposeConfig(releaseEvalCompose, [], {
        CAT_SPACY_IMAGE_ID: "sha256:eval-spacy-image",
      }),
    ) as ComposeConfig;

    expect(resolved.services).toEqual(
      expect.objectContaining({
        postgresql: expect.any(Object),
        redis: expect.any(Object),
        spacy: expect.objectContaining({ image: "sha256:eval-spacy-image" }),
      }),
    );
  });

  it("keeps the canonical local Compose entry visible in a clean checkout", async () => {
    await expect(readFile(localCompose, "utf8")).resolves.toContain(
      "name: cat-local",
    );
  });

  it("publishes self-contained standalone and externally prepared runtime deployment modes", async () => {
    const raw = await readFile(productionCompose, "utf8");
    expect(raw).not.toMatch(/^\s*(build|configs|extends|include):/mu);
    expect(raw).not.toContain("../");
    expect(raw).not.toContain("./");

    const compose = parse(raw) as ComposeConfig;
    expect(compose.services).toEqual(
      expect.objectContaining({
        app: expect.objectContaining({
          command: ["${CAT_APPLICATION_COMMAND:-prepare-and-start}"],
        }),
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
        profiles: ["runtime-preparation"],
        depends_on: expect.objectContaining({
          postgresql: { condition: "service_healthy" },
          redis: { condition: "service_healthy" },
          spacy: { condition: "service_healthy" },
        }),
      }),
    );
    expect(compose.services.bootstrap).toEqual(
      expect.objectContaining({
        profiles: ["runtime-preparation"],
        depends_on: {
          prepare: { condition: "service_completed_successfully" },
        },
      }),
    );
    expect(compose.services.app).toMatchObject({
      command: ["${CAT_APPLICATION_COMMAND:-prepare-and-start}"],
      image:
        "${CAT_APPLICATION_IMAGE:-${CAT_STANDALONE_IMAGE:-ghcr.io/ykdz/cat:latest}}",
    });
    expect(compose.services.app).toMatchObject({
      depends_on: {
        postgresql: { condition: "service_healthy" },
        redis: { condition: "service_healthy" },
        spacy: { condition: "service_healthy" },
      },
    });
    expect(compose.services.app).not.toHaveProperty("depends_on.bootstrap");

    const resolved = JSON.parse(
      await runComposeConfig(productionCompose),
    ) as ComposeConfig;
    const prepared = JSON.parse(
      await runComposeConfig(productionCompose, ["runtime-preparation"]),
    ) as ComposeConfig;
    expect(resolved.services).not.toHaveProperty("prepare");
    expect(resolved.services).not.toHaveProperty("bootstrap");
    for (const service of Object.values(prepared.services)) {
      expect(service).not.toHaveProperty("build");
      expect(service).not.toHaveProperty("extends");
      expect(service).not.toHaveProperty("configs");
      expect(JSON.stringify(service)).not.toContain('type":"bind');
      expect(service.image).toEqual(expect.any(String));
    }
    expect(prepared.volumes).toEqual(
      expect.objectContaining({
        "cat-data": expect.any(Object),
        "postgresql-data": expect.any(Object),
        "redis-data": expect.any(Object),
        "spacy-config": expect.objectContaining({ name: "cat-spacy-config" }),
        "spacy-models": expect.any(Object),
      }),
    );
    expect(prepared.services.spacy).toMatchObject({
      environment: {
        SPACY_EXTERNAL_PLAN: "",
        SPACY_EXTERNAL_PLAN_SHA256: "",
        SPACY_MODELS_ROOT: "/models",
      },
      read_only: true,
      user: "10001:10001",
      volumes: expect.arrayContaining([
        expect.objectContaining({ target: "/models" }),
        expect.objectContaining({
          read_only: true,
          source: "spacy-config",
          target: "/config",
          type: "volume",
        }),
      ]),
    });
    for (const name of ["prepare", "bootstrap", "app"]) {
      const service = prepared.services[name];
      if (service === undefined) {
        throw new Error(`Expected prepared service ${name}`);
      }
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
    expect(prepared.services.prepare).not.toHaveProperty(
      "environment.CAT_BOOTSTRAP_PLAN",
    );
    expect(prepared.services.app).not.toHaveProperty(
      "environment.CAT_BOOTSTRAP_PLAN",
    );
    expect(prepared.services.bootstrap?.environment).toHaveProperty(
      "CAT_BOOTSTRAP_PLAN",
    );
    expect(resolved.services.app?.command).toEqual(["prepare-and-start"]);
    expect(resolved.services.app?.image).toBe("ghcr.io/ykdz/cat:latest");
    expect(resolved.services.postgresql).toMatchObject({
      image: "pgvector/pgvector:0.8.6-pg18",
    });
    expect(JSON.stringify(resolved.services.postgresql?.healthcheck)).toContain(
      "pg_isready",
    );
    expect(
      JSON.stringify(resolved.services.postgresql?.healthcheck),
    ).not.toContain("psql");
    expect(JSON.stringify(resolved.services.postgresql)).toContain(
      "/var/lib/postgresql",
    );
    expect(JSON.stringify(resolved.services.postgresql)).not.toContain(
      "/var/lib/postgresql/data",
    );
    expect(resolved.services.redis).toMatchObject({
      environment: { REDIS_PASSWORD: composeEnvironment.CAT_REDIS_PASSWORD },
    });
    expect(JSON.stringify(resolved.services.redis?.healthcheck)).toContain(
      "REDIS_PASSWORD",
    );

    const customConfigVolume = JSON.parse(
      await runComposeConfig(productionCompose, [], {
        CAT_SPACY_CONFIG_VOLUME: "operator-spacy-config",
      }),
    ) as ComposeConfig;
    expect(customConfigVolume.volumes["spacy-config"]).toMatchObject({
      name: "operator-spacy-config",
    });
    expect(customConfigVolume.services.spacy?.volumes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          read_only: true,
          source: "spacy-config",
          target: "/config",
        }),
      ]),
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

    const localResolved = JSON.parse(
      await runComposeConfig(local),
    ) as ComposeConfig;
    const e2eResolved = JSON.parse(
      await runComposeConfig(e2e),
    ) as ComposeConfig;
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
    for (const resolved of [localResolved, e2eResolved]) {
      const postgresql = resolved.services.postgresql;
      expect(postgresql).toMatchObject({
        image: "pgvector/pgvector:0.8.6-pg18",
      });
      expect(JSON.stringify(postgresql?.healthcheck)).toContain("pg_isready");
      expect(JSON.stringify(postgresql?.healthcheck)).not.toContain("psql");
      expect(JSON.stringify(postgresql)).toContain("/var/lib/postgresql");
      expect(JSON.stringify(postgresql)).not.toContain(
        "/var/lib/postgresql/data",
      );
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
