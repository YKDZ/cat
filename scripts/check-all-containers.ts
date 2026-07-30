import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { redactDiagnosticText } from "@cat/shared";

import { parseTestServiceLease } from "../apps/app-e2e/test-service-lease.ts";
import {
  CommandExecutionError,
  type ApplicationLifecycleContext,
  type CommandExecutionResult,
} from "./check-all.ts";
import {
  createValidatedImageManifest,
  type ReleaseImage,
  type ReleaseImageBuildResult,
  type ReleaseImageTarget,
} from "./image-builder.ts";

const dockerfile = "apps/app/Dockerfile";
const cleanupTimeoutMs = 30_000;
const lifecycleDatabaseCleanupTimeoutMs = 60_000;
const lifecycleDatabaseCleanupAttempts = 3;
const searchRuntimeInitializationPath = new URL(
  "../apps/postgres-search-runtime/init/01-init-extensions.sql",
  import.meta.url,
);

type ImageMode = ReleaseImageTarget;

type ContainerServiceUrls = {
  databaseUrl: string;
  redisUrl: string;
  spacyUrl: string;
};

type LifecycleDatabase = {
  initializeSearchRuntime: () => Promise<void>;
  serviceUrls: ContainerServiceUrls;
  remove: () => Promise<void>;
};

type LifecycleStorage = {
  mountArgs: string[];
  remove: () => Promise<void>;
};

export type ValidatedImageExport = {
  manifestDigest: string;
  manifestPath: string;
};

export type ApplicationLifecycleReport = {
  validatedImageIds: Record<ReleaseImageTarget, string>;
};

type ImageConfig = {
  Cmd?: unknown;
  Entrypoint?: unknown;
  Healthcheck?: { Test?: unknown };
  Labels?: Record<string, unknown>;
  User?: unknown;
  Volumes?: Record<string, unknown>;
};

const runDocker = async (
  context: ApplicationLifecycleContext,
  args: string[],
  stdio: "inherit" | "pipe" = "pipe",
  signal: AbortSignal = context.signal,
): Promise<CommandExecutionResult> =>
  await context.run("docker", args, {
    cwd: process.cwd(),
    env: context.env,
    signal,
    stdio,
  });

const docker = async (
  context: ApplicationLifecycleContext,
  args: string[],
  stdio: "inherit" | "pipe" = "pipe",
  signal: AbortSignal = context.signal,
): Promise<string> => (await runDocker(context, args, stdio, signal)).stdout;

const cleanupDocker = async (
  context: ApplicationLifecycleContext,
  args: string[],
): Promise<string> =>
  await docker(context, args, "pipe", AbortSignal.timeout(cleanupTimeoutMs));

const reportError = (
  context: ApplicationLifecycleContext,
  message: string,
): void => {
  (context.reportError ?? ((value: string) => process.stderr.write(value)))(
    redactDiagnosticText(message),
  );
};

const reportServerFailure = async (
  context: ApplicationLifecycleContext,
  container: string,
): Promise<void> => {
  reportError(context, `container lifecycle failure container=${container}\n`);
  try {
    const logs = await runDocker(
      context,
      ["logs", "--tail", "200", container],
      "pipe",
    );
    if (logs.stdout !== "") reportError(context, logs.stdout);
    if (logs.stderr !== "") reportError(context, logs.stderr);
  } catch (error) {
    reportError(
      context,
      `container lifecycle logs container=${container} unavailable=${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  try {
    const state = await docker(
      context,
      [
        "inspect",
        "--format",
        "status={{.State.Status}} exit-code={{.State.ExitCode}} oom-killed={{.State.OOMKilled}} error={{.State.Error}}",
        container,
      ],
      "pipe",
    );
    reportError(
      context,
      `container lifecycle state container=${container} ${state.trim() || "<empty>"}\n`,
    );
  } catch (error) {
    reportError(
      context,
      `container lifecycle inspect container=${container} unavailable=${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
};

const cleanupLifecycleDatabase = async (
  context: ApplicationLifecycleContext,
  args: string[],
): Promise<string> =>
  await docker(
    context,
    args,
    "pipe",
    AbortSignal.timeout(lifecycleDatabaseCleanupTimeoutMs),
  );

const contextContractImageName = (
  context: ApplicationLifecycleContext,
): string => `${context.projectName}-app:context-contract`;

const serviceProjectName = (context: ApplicationLifecycleContext): string => {
  const serializedLease = context.env.CAT_TEST_SERVICE_LEASE;
  if (serializedLease === undefined) return context.projectName;
  return parseTestServiceLease(serializedLease).ownership.projectName;
};

const releaseImage = (
  images: ReleaseImageBuildResult,
  target: ImageMode,
): ReleaseImage => {
  const image = images.images.find((candidate) => candidate.target === target);
  if (image === undefined) {
    throw new Error(
      `Missing immutable ${target} image for container validation`,
    );
  }
  return image;
};

const buildContextContract = async (
  context: ApplicationLifecycleContext,
): Promise<string> => {
  const image = contextContractImageName(context);
  await docker(context, [
    "build",
    "--progress=quiet",
    "--file",
    dockerfile,
    "--target",
    "context-contract",
    "--build-arg",
    `DEPLOYMENT_BUILD_ID=${context.projectName}`,
    "--tag",
    image,
    ".",
  ]);
  return image;
};

const environmentArgs = (serviceUrls: ContainerServiceUrls): string[] => {
  const database = new URL(serviceUrls.databaseUrl);
  database.hostname = "postgresql";
  database.port = "5432";
  const redis = new URL(serviceUrls.redisUrl);
  redis.hostname = "redis";
  redis.port = "6379";
  const spacy = new URL(serviceUrls.spacyUrl);
  spacy.hostname = "spacy";
  spacy.port = "8000";
  return [
    "--env",
    `DATABASE_URL=${database.toString()}`,
    "--env",
    `REDIS_URL=${redis.toString()}`,
    "--env",
    `SPACY_SERVER_URL=${spacy.toString()}`,
    "--env",
    "HOST=127.0.0.1",
    "--env",
    "PORT=3000",
  ];
};

const lifecycleStorageVolumeName = (
  context: ApplicationLifecycleContext,
): string => `${context.projectName}-lifecycle-storage`;

const lifecycleBootstrapPlan = (context: ApplicationLifecycleContext): string =>
  JSON.stringify({
    idempotencyKey: `${context.projectName}-lifecycle-services-v1`,
    operations: [
      {
        pluginId: "local-storage-provider",
        scopeId: "",
        scopeType: "GLOBAL",
        type: "install-if-absent",
        value: { "root-path": "/data/storage" },
      },
      {
        pluginId: "spacy-segmenter",
        scopeId: "",
        scopeType: "GLOBAL",
        type: "install-if-absent",
        value: { serverUrl: "http://spacy:8000" },
      },
    ],
    version: "1",
  });

const createLifecycleStorage = async (
  context: ApplicationLifecycleContext,
): Promise<LifecycleStorage> => {
  const volumeName = lifecycleStorageVolumeName(context);
  await docker(context, ["volume", "create", volumeName], "pipe");
  return {
    mountArgs: ["--mount", `type=volume,src=${volumeName},dst=/data/storage`],
    remove: async (): Promise<void> => {
      await cleanupDocker(context, ["volume", "rm", "--force", volumeName]);
    },
  };
};

const createLifecycleDatabase = async (
  context: ApplicationLifecycleContext,
): Promise<LifecycleDatabase> => {
  const databaseUrl = context.env.DATABASE_URL;
  const redisUrl = context.env.REDIS_URL;
  const spacyUrl = context.env.SPACY_SERVER_URL;
  if (!databaseUrl || !redisUrl || !spacyUrl) {
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
  const postgresContainer = `${serviceProjectName(context)}-postgresql-1`;
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
        await readFile(searchRuntimeInitializationPath, "utf8"),
      ]);
    },
    serviceUrls: { databaseUrl: connection.toString(), redisUrl, spacyUrl },
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
  image: string,
): Promise<void> => {
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
      (context.buildId ?? context.projectName) ||
    !("/data" in (config.Volumes ?? {})) ||
    !Array.isArray(config.Healthcheck?.Test) ||
    !config.Healthcheck.Test.join(" ").includes(
      "/usr/local/bin/docker-health-check.js",
    )
  ) {
    throw new Error(`Image ${image} does not satisfy its config contract`);
  }

  const lifecycleArtifactsAssertion =
    mode === "standalone"
      ? "test -f /app/.preparation/prepare-database.mjs && test -d /app/.preparation/drizzle && test -f /app/dist/bootstrap-only/bootstrap-only-cli.js"
      : "test ! -e /app/.preparation && test ! -e /app/drizzle && test ! -e /app/scripts && test ! -e /app/dist/bootstrap-only && test ! -e /app/compose.yaml && test ! -e /app/compose.local.yaml && test ! -e /app/compose.services.yaml && test ! -e /app/Dockerfile";
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
test ! -w /app/plugins
test -w /data
test -w /data/storage
test -w /tmp
test -d /app/plugins
test -L /app/storage
test "$(readlink /app/storage)" = "/data/storage"
${lifecycleArtifactsAssertion}`,
  ]);
};

const assertRuntimeCannotBypassLifecycle = async (
  context: ApplicationLifecycleContext,
  image: string,
): Promise<void> => {
  for (const implementation of [
    "/app/.preparation/prepare-database.mjs",
    "/app/dist/bootstrap-only/bootstrap-only-cli.js",
    "/app/scripts/bootstrap-local.mjs",
    "/app/scripts/container-entrypoint-standalone.sh",
    "/app/scripts/copy-drizzle.ts",
    "/app/scripts/dev.ts",
  ]) {
    try {
      await docker(context, [
        "run",
        "--rm",
        "--entrypoint",
        "node",
        image,
        implementation,
      ]);
    } catch (error) {
      if (error instanceof CommandExecutionError) continue;
      throw error;
    }
    throw new Error(
      `Runtime image exposed lifecycle implementation ${implementation}`,
    );
  }
};

const runOneShot = async (
  context: ApplicationLifecycleContext,
  image: string,
  network: string,
  serviceUrls: ContainerServiceUrls,
  command: string,
  options: {
    environment?: string[];
    storage?: LifecycleStorage;
  } = {},
): Promise<void> => {
  await docker(context, [
    "run",
    "--rm",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,mode=1777",
    "--network",
    network,
    ...(options.storage?.mountArgs ?? []),
    ...environmentArgs(serviceUrls),
    ...(options.environment ?? []),
    image,
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
      throw new Error(`Container ${container} became unhealthy`);
    }
    await sleep(2_000, undefined, { signal: context.signal });
  }
  throw new Error(`Timed out waiting for container ${container}`);
};

const runServer = async (
  context: ApplicationLifecycleContext,
  image: string,
  network: string,
  serviceUrls: ContainerServiceUrls,
  container: string,
  command: string,
  storage: LifecycleStorage,
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
      ...storage.mountArgs,
      ...environmentArgs(serviceUrls),
      image,
      command,
    ],
    "pipe",
  );
  let failure: unknown;
  try {
    await waitForHealthy(context, container);
  } catch (error) {
    failure = error;
    await reportServerFailure(context, container);
  }
  let cleanupFailure: unknown;
  try {
    await cleanupDocker(context, ["rm", "--force", "--volumes", container]);
    if (failure !== undefined) {
      reportError(
        context,
        `container lifecycle cleanup container=${container} result=passed\n`,
      );
    }
  } catch (error) {
    cleanupFailure = error;
    reportError(
      context,
      `container lifecycle cleanup container=${container} result=failed failure=${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  if (failure !== undefined && cleanupFailure !== undefined) {
    throw new AggregateError(
      [failure, cleanupFailure],
      "Application container validation and cleanup failed",
    );
  }
  if (failure !== undefined) throw failure;
  if (cleanupFailure !== undefined) throw cleanupFailure;
};

const assertRejectedLifecycleCommand = async (
  context: ApplicationLifecycleContext,
  mode: ImageMode,
  image: string,
  network: string,
  serviceUrls: ContainerServiceUrls,
  command: string,
): Promise<void> => {
  try {
    await runOneShot(context, image, network, serviceUrls, command);
  } catch (error) {
    if (error instanceof CommandExecutionError && error.exitCode === 64) return;
    throw error;
  }
  throw new Error(`Image ${mode} accepted unsupported command ${command}`);
};

const assertRuntimeRejectsCapabilityOverride = async (
  context: ApplicationLifecycleContext,
  image: string,
  network: string,
  serviceUrls: ContainerServiceUrls,
): Promise<void> => {
  try {
    await docker(context, [
      "run",
      "--rm",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,noexec,mode=1777",
      "--network",
      network,
      "--env",
      "CONTAINER_CAPABILITY=prepare-and-start",
      ...environmentArgs(serviceUrls),
      image,
      "bootstrap-only",
    ]);
  } catch (error) {
    if (error instanceof CommandExecutionError && error.exitCode === 64) return;
    throw error;
  }
  throw new Error("Runtime image accepted an overridden lifecycle capability");
};

export const exportValidatedImages = async (
  context: ApplicationLifecycleContext,
  images: ReleaseImageBuildResult,
): Promise<ValidatedImageExport | undefined> => {
  const directory = context.env.CAT_CHECK_ALL_EXPORT_IMAGES_DIR;
  if (directory === undefined || directory === "") return undefined;
  await mkdir(directory, { recursive: true });
  for (const target of ["standalone", "runtime"] as const) {
    await docker(context, [
      "image",
      "save",
      "--output",
      join(directory, `${target}.tar`),
      releaseImage(images, target).imageId,
    ]);
  }
  const manifestPath = join(directory, "manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      createValidatedImageManifest(
        images,
        context.buildId ?? context.projectName,
      ),
    )}\n`,
  );
  return {
    manifestDigest: createHash("sha256")
      .update(await readFile(manifestPath))
      .digest("hex"),
    manifestPath,
  };
};

export const runApplicationLifecycle = async (
  context: ApplicationLifecycleContext,
  images: ReleaseImageBuildResult,
): Promise<ApplicationLifecycleReport> => {
  const network = `${serviceProjectName(context)}_default`;
  const temporaryImages: string[] = [];
  let lifecycleDatabase: LifecycleDatabase | undefined;
  let lifecycleStorage: LifecycleStorage | undefined;
  let failure: unknown;
  try {
    const contextContractImage = await buildContextContract(context);
    temporaryImages.push(contextContractImage);
    const standaloneImage = releaseImage(images, "standalone").imageId;
    const runtimeImage = releaseImage(images, "runtime").imageId;
    await assertImageConfig(context, "standalone", standaloneImage);
    await assertImageConfig(context, "runtime", runtimeImage);
    await assertRuntimeCannotBypassLifecycle(context, runtimeImage);

    lifecycleDatabase = await createLifecycleDatabase(context);
    lifecycleStorage = await createLifecycleStorage(context);
    await lifecycleDatabase.initializeSearchRuntime();
    await runOneShot(
      context,
      standaloneImage,
      network,
      lifecycleDatabase.serviceUrls,
      "prepare-only",
      { storage: lifecycleStorage },
    );
    await runOneShot(
      context,
      standaloneImage,
      network,
      lifecycleDatabase.serviceUrls,
      "prepare-only",
      { storage: lifecycleStorage },
    );
    await runOneShot(
      context,
      standaloneImage,
      network,
      lifecycleDatabase.serviceUrls,
      "bootstrap-only",
      {
        environment: [
          "--env",
          `CAT_BOOTSTRAP_PLAN=${lifecycleBootstrapPlan(context)}`,
        ],
        storage: lifecycleStorage,
      },
    );
    await runServer(
      context,
      standaloneImage,
      network,
      lifecycleDatabase.serviceUrls,
      `${context.projectName}-standalone`,
      "prepare-and-start",
      lifecycleStorage,
    );
    await runServer(
      context,
      runtimeImage,
      network,
      lifecycleDatabase.serviceUrls,
      `${context.projectName}-runtime`,
      "start-only",
      lifecycleStorage,
    );
    for (const command of [
      "prepare-only",
      "bootstrap-only",
      "prepare-and-start",
    ]) {
      await assertRejectedLifecycleCommand(
        context,
        "runtime",
        runtimeImage,
        network,
        lifecycleDatabase.serviceUrls,
        command,
      );
    }
    await assertRuntimeRejectsCapabilityOverride(
      context,
      runtimeImage,
      network,
      lifecycleDatabase.serviceUrls,
    );
    await assertRejectedLifecycleCommand(
      context,
      "standalone",
      standaloneImage,
      network,
      lifecycleDatabase.serviceUrls,
      "start-only",
    );
  } catch (error) {
    failure = error;
  }
  const cleanupFailures: unknown[] = [];
  if (lifecycleStorage !== undefined) {
    try {
      await lifecycleStorage.remove();
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (lifecycleDatabase !== undefined) {
    try {
      await lifecycleDatabase.remove();
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (temporaryImages.length > 0) {
    try {
      await cleanupDocker(context, [
        "image",
        "rm",
        "--force",
        ...temporaryImages,
      ]);
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  if (failure !== undefined && cleanupFailures.length > 0) {
    throw new AggregateError(
      [failure, ...cleanupFailures],
      "Application lifecycle validation and cleanup failed",
    );
  }
  if (failure !== undefined) throw failure;
  if (cleanupFailures.length > 0) {
    throw new AggregateError(
      cleanupFailures,
      "Application lifecycle cleanup failed",
    );
  }
  return {
    validatedImageIds: {
      runtime: releaseImage(images, "runtime").imageId,
      standalone: releaseImage(images, "standalone").imageId,
    },
  };
};
