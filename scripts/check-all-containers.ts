import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

import {
  CommandExecutionError,
  type ApplicationLifecycleContext,
} from "./check-all.ts";

const dockerfile = "apps/app/Dockerfile";
const cleanupTimeoutMs = 30_000;
const lifecycleDatabaseCleanupTimeoutMs = 60_000;
const lifecycleDatabaseCleanupAttempts = 3;
const initializeSearchRuntimeCommand = `CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS rum;
CREATE EXTENSION IF NOT EXISTS zhparser;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config WHERE cfgname = 'cat_zh_hans'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION cat_zh_hans (PARSER = zhparser);
    ALTER TEXT SEARCH CONFIGURATION cat_zh_hans
      ADD MAPPING FOR n, v, a, i, e, l WITH simple;
  END IF;
END
$$;`;

type ImageMode = "standalone" | "runtime";

type ContainerServiceUrls = {
  databaseUrl: string;
  redisUrl: string;
};

type LifecycleDatabase = {
  initializeSearchRuntime: () => Promise<void>;
  serviceUrls: ContainerServiceUrls;
  remove: () => Promise<void>;
};

type ImageConfig = {
  Cmd?: unknown;
  Entrypoint?: unknown;
  Healthcheck?: { Test?: unknown };
  Labels?: Record<string, unknown>;
  User?: unknown;
  Volumes?: Record<string, unknown>;
};

const docker = async (
  context: ApplicationLifecycleContext,
  args: string[],
  stdio: "inherit" | "pipe" = "inherit",
  signal: AbortSignal = context.signal,
): Promise<string> =>
  (
    await context.run("docker", args, {
      cwd: process.cwd(),
      env: context.env,
      signal,
      stdio,
    })
  ).stdout;

const cleanupDocker = async (
  context: ApplicationLifecycleContext,
  args: string[],
): Promise<string> =>
  await docker(context, args, "inherit", AbortSignal.timeout(cleanupTimeoutMs));

const cleanupLifecycleDatabase = async (
  context: ApplicationLifecycleContext,
  args: string[],
): Promise<string> =>
  await docker(
    context,
    args,
    "inherit",
    AbortSignal.timeout(lifecycleDatabaseCleanupTimeoutMs),
  );

const imageName = (
  context: ApplicationLifecycleContext,
  target: "context-contract" | ImageMode,
): string => `${context.projectName}-app:${target}`;

const build = async (
  context: ApplicationLifecycleContext,
  target: "context-contract" | ImageMode,
): Promise<void> => {
  await docker(context, [
    "build",
    "--file",
    dockerfile,
    "--target",
    target,
    "--build-arg",
    `DEPLOYMENT_BUILD_ID=${context.projectName}`,
    "--tag",
    imageName(context, target),
    ".",
  ]);
};

const environmentArgs = (serviceUrls: ContainerServiceUrls): string[] => {
  const database = new URL(serviceUrls.databaseUrl);
  database.hostname = "postgresql";
  database.port = "5432";
  const redis = new URL(serviceUrls.redisUrl);
  redis.hostname = "redis";
  redis.port = "6379";
  return [
    "--env",
    `DATABASE_URL=${database.toString()}`,
    "--env",
    `REDIS_URL=${redis.toString()}`,
    "--env",
    "HOST=127.0.0.1",
    "--env",
    "PORT=3000",
  ];
};

const createLifecycleDatabase = async (
  context: ApplicationLifecycleContext,
): Promise<LifecycleDatabase> => {
  const databaseUrl = context.env.DATABASE_URL;
  const redisUrl = context.env.REDIS_URL;
  if (!databaseUrl || !redisUrl) {
    throw new Error("check:all container lifecycle requires database URLs");
  }

  const connection = new URL(databaseUrl);
  const username = decodeURIComponent(connection.username);
  const password = decodeURIComponent(connection.password);
  if (username === "" || password === "") {
    throw new Error(
      "check:all container lifecycle requires database credentials",
    );
  }
  const databaseName = `cat_lifecycle_${randomUUID().replaceAll("-", "")}`;
  const postgresContainer = `${context.projectName}-postgresql-1`;
  const createCommand = `CREATE DATABASE "${databaseName}"`;
  const terminateConnectionsCommand = `SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${databaseName}'
  AND pid <> pg_backend_pid()`;
  const dropCommand = `DROP DATABASE "${databaseName}" WITH (FORCE)`;

  await docker(context, [
    "exec",
    "--env",
    `PGPASSWORD=${password}`,
    postgresContainer,
    "psql",
    "--username",
    username,
    "--dbname",
    "postgres",
    "--set",
    "ON_ERROR_STOP=1",
    "--command",
    createCommand,
  ]);

  connection.hostname = "postgresql";
  connection.port = "5432";
  connection.pathname = `/${databaseName}`;
  return {
    initializeSearchRuntime: async (): Promise<void> => {
      await docker(context, [
        "exec",
        "--env",
        `PGPASSWORD=${password}`,
        postgresContainer,
        "psql",
        "--username",
        username,
        "--dbname",
        databaseName,
        "--set",
        "ON_ERROR_STOP=1",
        "--command",
        initializeSearchRuntimeCommand,
      ]);
    },
    serviceUrls: { databaseUrl: connection.toString(), redisUrl },
    remove: async (): Promise<void> => {
      let lastError: unknown;
      for (
        let attempt = 1;
        attempt <= lifecycleDatabaseCleanupAttempts;
        attempt += 1
      ) {
        try {
          await cleanupLifecycleDatabase(context, [
            "exec",
            "--env",
            `PGPASSWORD=${password}`,
            postgresContainer,
            "psql",
            "--username",
            username,
            "--dbname",
            "postgres",
            "--set",
            "ON_ERROR_STOP=1",
            "--command",
            terminateConnectionsCommand,
          ]);
          await cleanupLifecycleDatabase(context, [
            "exec",
            "--env",
            `PGPASSWORD=${password}`,
            postgresContainer,
            "psql",
            "--username",
            username,
            "--dbname",
            "postgres",
            "--set",
            "ON_ERROR_STOP=1",
            "--command",
            dropCommand,
          ]);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < lifecycleDatabaseCleanupAttempts) {
            await sleep(attempt * 100);
          }
        }
      }
      throw lastError;
    },
  };
};

const parseImageConfig = (raw: string, image: string): ImageConfig => {
  const value: unknown = JSON.parse(raw);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Docker returned an invalid config for ${image}`);
  }
  return value;
};

const assertImageConfig = async (
  context: ApplicationLifecycleContext,
  mode: ImageMode,
): Promise<void> => {
  const image = imageName(context, mode);
  const config = parseImageConfig(
    await docker(
      context,
      ["image", "inspect", "--format", "{{json .Config}}", image],
      "pipe",
    ),
    image,
  );
  const expectedCommand =
    mode === "standalone" ? "prepare-and-start" : "start-only";
  if (
    config.User !== "1001:1001" ||
    JSON.stringify(config.Cmd) !== JSON.stringify([expectedCommand]) ||
    JSON.stringify(config.Entrypoint) !==
      JSON.stringify(["/usr/local/bin/container-entrypoint"]) ||
    config.Labels?.["org.opencontainers.image.version"] !==
      context.projectName ||
    !("/data" in (config.Volumes ?? {})) ||
    !Array.isArray(config.Healthcheck?.Test) ||
    !config.Healthcheck.Test.join(" ").includes(
      "/usr/local/bin/docker-health-check.js",
    )
  ) {
    throw new Error(`Image ${image} does not satisfy its config contract`);
  }

  const preparationAssertion =
    mode === "standalone"
      ? "test -f /app/.preparation/prepare-database.mjs && test -d /app/.preparation/drizzle"
      : "test ! -e /app/.preparation && test ! -e /app/drizzle && test ! -e /app/scripts/prepare-database.mjs";
  await docker(context, [
    "run",
    "--rm",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,mode=1777",
    "--entrypoint",
    "/bin/sh",
    image,
    "-ec",
    `test "$(id -u):$(id -g)" = "1001:1001"
test "$(stat -c '%u:%g' /app)" = "0:0"
test "$(stat -c '%u:%g' /app/dist)" = "0:0"
test "$(stat -c '%u:%g' /app/plugins)" = "0:0"
test "$(stat -c '%u:%g' /data/storage)" = "1001:1001"
test ! -w /app
test -w /data/storage
test -d /app/plugins
test -L /app/storage
test "$(readlink /app/storage)" = "/data/storage"
${preparationAssertion}`,
  ]);
};

const runOneShot = async (
  context: ApplicationLifecycleContext,
  mode: ImageMode,
  network: string,
  serviceUrls: ContainerServiceUrls,
  command: string,
): Promise<void> => {
  await docker(context, [
    "run",
    "--rm",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,mode=1777",
    "--network",
    network,
    ...environmentArgs(serviceUrls),
    imageName(context, mode),
    command,
  ]);
};

const waitForHealthy = async (
  context: ApplicationLifecycleContext,
  container: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    context.signal.throwIfAborted();
    const status = (
      await docker(
        context,
        ["inspect", "--format", "{{.State.Health.Status}}", container],
        "pipe",
      )
    ).trim();
    context.signal.throwIfAborted();
    if (status === "healthy") return;
    if (status === "unhealthy") {
      await docker(context, ["logs", container]);
      throw new Error(`Container ${container} became unhealthy`);
    }
    await sleep(2_000, undefined, { signal: context.signal });
  }
  throw new Error(`Timed out waiting for container ${container}`);
};

const runServer = async (
  context: ApplicationLifecycleContext,
  mode: ImageMode,
  network: string,
  serviceUrls: ContainerServiceUrls,
  container: string,
  command: string,
): Promise<void> => {
  await docker(
    context,
    [
      "run",
      "--detach",
      "--name",
      container,
      "--read-only",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,noexec,mode=1777",
      "--network",
      network,
      ...environmentArgs(serviceUrls),
      imageName(context, mode),
      command,
    ],
    "pipe",
  );
  try {
    await waitForHealthy(context, container);
  } finally {
    await cleanupDocker(context, ["rm", "--force", "--volumes", container]);
  }
};

const assertRuntimeRejectsPreparation = async (
  context: ApplicationLifecycleContext,
  network: string,
  serviceUrls: ContainerServiceUrls,
): Promise<void> => {
  try {
    await runOneShot(context, "runtime", network, serviceUrls, "prepare-only");
  } catch (error) {
    if (error instanceof CommandExecutionError && error.exitCode === 64) return;
    throw error;
  }
  throw new Error("Runtime image accepted a database preparation command");
};

const exportValidatedImages = async (
  context: ApplicationLifecycleContext,
): Promise<void> => {
  const directory = context.env.CAT_CHECK_ALL_EXPORT_IMAGES_DIR;
  if (directory === undefined || directory === "") return;
  for (const mode of ["standalone", "runtime"] as const) {
    await docker(context, [
      "image",
      "save",
      "--output",
      `${directory}/${mode}.tar`,
      imageName(context, mode),
    ]);
  }
};

export const runApplicationLifecycle = async (
  context: ApplicationLifecycleContext,
): Promise<void> => {
  const network = `${context.projectName}_default`;
  const images: string[] = [];
  let lifecycleDatabase: LifecycleDatabase | undefined;
  let failure: unknown;
  try {
    await build(context, "context-contract");
    images.push(imageName(context, "context-contract"));
    await build(context, "standalone");
    images.push(imageName(context, "standalone"));
    await build(context, "runtime");
    images.push(imageName(context, "runtime"));
    await assertImageConfig(context, "standalone");
    await assertImageConfig(context, "runtime");

    lifecycleDatabase = await createLifecycleDatabase(context);
    await lifecycleDatabase.initializeSearchRuntime();
    await runOneShot(
      context,
      "standalone",
      network,
      lifecycleDatabase.serviceUrls,
      "prepare-only",
    );
    await runOneShot(
      context,
      "standalone",
      network,
      lifecycleDatabase.serviceUrls,
      "prepare-only",
    );
    await runServer(
      context,
      "standalone",
      network,
      lifecycleDatabase.serviceUrls,
      `${context.projectName}-standalone`,
      "prepare-and-start",
    );
    await runServer(
      context,
      "runtime",
      network,
      lifecycleDatabase.serviceUrls,
      `${context.projectName}-runtime`,
      "start-only",
    );
    await assertRuntimeRejectsPreparation(
      context,
      network,
      lifecycleDatabase.serviceUrls,
    );
    await exportValidatedImages(context);
  } catch (error) {
    failure = error;
  }
  if (lifecycleDatabase !== undefined) {
    try {
      await lifecycleDatabase.remove();
    } catch (error) {
      if (failure === undefined) failure = error;
    }
  }
  if (images.length > 0) {
    try {
      await cleanupDocker(context, ["image", "rm", "--force", ...images]);
    } catch (error) {
      if (failure === undefined) failure = error;
    }
  }
  if (failure !== undefined) throw failure;
};
