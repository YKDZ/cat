import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ServiceLeaseCommandRunnerOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  stdio: "inherit" | "pipe";
}

export type ServiceLeaseCommandRunner = (
  command: string,
  args: string[],
  options: ServiceLeaseCommandRunnerOptions,
) => Promise<{ stdout: string }>;

export interface TestServiceCoordinates {
  databaseUrl: string;
  redisUrl: string;
  spacyUrl: string;
}

export interface TestServiceOwnership {
  projectName: string;
  token: string;
}

export interface TestServiceLeaseBorrow {
  release: () => Promise<void>;
}

export interface TestServiceLease {
  borrow: () => TestServiceLeaseBorrow;
  coordinates: TestServiceCoordinates;
  ownership: TestServiceOwnership;
  release: () => Promise<void>;
}

export interface AcquireTestServiceLeaseOptions {
  dockerHost?: string;
  environment: NodeJS.ProcessEnv;
  run: ServiceLeaseCommandRunner;
  signal: AbortSignal;
}

export interface UseTestServiceLeaseOptions extends AcquireTestServiceLeaseOptions {
  lease?: TestServiceLease;
}

const workspaceRoot = resolve(import.meta.dirname, "../..");
const composeFile = resolve(import.meta.dirname, "compose.e2e.yaml");
const cleanupTimeoutMs = 60_000;
const composeShutdownSeconds = 15;
const ownershipLabel = "cat.test-service-lease.token";
const composeProjectLabel = "com.docker.compose.project";
const serviceNames = ["postgresql", "redis", "spacy"] as const;

type ResourceKind = "container" | "network" | "volume";
type ComposeService = {
  Health?: string;
  Name?: string;
  Service?: string;
  State?: string;
};

const composeArguments = (projectName: string): string[] => [
  "compose",
  "--progress",
  "quiet",
  "--project-name",
  projectName,
  "--file",
  composeFile,
];

const parsePublishedPort = (value: string, service: string): number => {
  const port = Number(value.trim().match(/:(\d+)$/)?.[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `Could not discover ${service} published port from ${JSON.stringify(value)}`,
    );
  }
  return port;
};

const formatUrlHost = (host: string): string =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

const randomIdentifier = (prefix: string): string =>
  `${prefix}_${randomUUID().replaceAll("-", "")}`;

const generatedProjectName = (): string =>
  `cat-e2e-${process.pid}-${randomUUID().replaceAll("-", "")}`;

const defaultGateway = (): string | undefined => {
  if (!existsSync("/.dockerenv")) return undefined;
  const route = readFileSync("/proc/net/route", "utf8")
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((columns) => columns[1] === "00000000");
  const gateway = route?.[2];
  if (gateway === undefined || !/^[0-9A-Fa-f]{8}$/.test(gateway))
    return undefined;
  return gateway
    .match(/../g)
    ?.reverse()
    .map((byte) => Number.parseInt(byte, 16))
    .join(".");
};

const assertSafeBindHost = (host: string): string => {
  if (host === "0.0.0.0" || host === "::") {
    throw new Error("Test service ports must bind to a specific host");
  }
  return host;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  name: string,
): void => {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = keys.filter((key) => !(key in value));
  if (unknown.length > 0 || missing.length > 0) {
    throw new Error(`CAT_TEST_SERVICE_LEASE has invalid ${name} fields`);
  }
};

const assertNonEmptyString = (value: unknown, name: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(
      `CAT_TEST_SERVICE_LEASE ${name} must be a non-empty string`,
    );
  }
  return value;
};

const assertProtocol = (
  value: string,
  name: string,
  protocols: readonly string[],
): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`CAT_TEST_SERVICE_LEASE ${name} must be a valid URL`);
  }
  if (!protocols.includes(url.protocol)) {
    throw new Error(
      `CAT_TEST_SERVICE_LEASE ${name} must use ${protocols.join(" or ")}`,
    );
  }
  return value;
};

const parseComposeServices = (value: string): ComposeService[] => {
  if (value.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    try {
      const entries = value
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line));
      if (entries.every(isRecord)) return entries;
    } catch {
      // Fall through to the stable public error below.
    }
    throw new Error("Docker Compose returned invalid service status JSON");
  }
  if (Array.isArray(parsed) && parsed.every(isRecord)) return parsed;
  if (isRecord(parsed)) return [parsed];
  throw new Error("Docker Compose returned invalid service status JSON");
};

const cleanupFailure = (
  cleanupError: unknown,
  consumerFailed: boolean,
  consumerFailure: unknown,
): AggregateError =>
  new AggregateError(
    consumerFailed ? [consumerFailure, cleanupError] : [cleanupError],
    consumerFailed
      ? "Test service lease consumer failed and cleanup also failed"
      : "Test service lease cleanup failed",
  );

const noopBorrow = (): TestServiceLeaseBorrow => ({
  release: async (): Promise<void> => undefined,
});

export const serializeTestServiceLease = (lease: TestServiceLease): string =>
  JSON.stringify({
    coordinates: lease.coordinates,
    ownership: lease.ownership,
    version: 1,
  });

export const parseTestServiceLease = (value: string): TestServiceLease => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("CAT_TEST_SERVICE_LEASE must be valid JSON");
  }
  if (!isRecord(parsed)) {
    throw new Error("CAT_TEST_SERVICE_LEASE must be an object");
  }
  assertExactKeys(parsed, ["version", "coordinates", "ownership"], "root");
  if (
    parsed.version !== 1 ||
    !isRecord(parsed.coordinates) ||
    !isRecord(parsed.ownership)
  ) {
    throw new Error("CAT_TEST_SERVICE_LEASE must use schema version 1");
  }
  assertExactKeys(
    parsed.coordinates,
    ["databaseUrl", "redisUrl", "spacyUrl"],
    "coordinates",
  );
  assertExactKeys(parsed.ownership, ["projectName", "token"], "ownership");
  const coordinates = {
    databaseUrl: assertProtocol(
      assertNonEmptyString(parsed.coordinates.databaseUrl, "databaseUrl"),
      "databaseUrl",
      ["postgresql:"],
    ),
    redisUrl: assertProtocol(
      assertNonEmptyString(parsed.coordinates.redisUrl, "redisUrl"),
      "redisUrl",
      ["redis:"],
    ),
    spacyUrl: assertProtocol(
      assertNonEmptyString(parsed.coordinates.spacyUrl, "spacyUrl"),
      "spacyUrl",
      ["http:", "https:"],
    ),
  };
  const ownership = {
    projectName: assertNonEmptyString(
      parsed.ownership.projectName,
      "projectName",
    ),
    token: assertNonEmptyString(parsed.ownership.token, "token"),
  };
  return {
    borrow: noopBorrow,
    coordinates,
    ownership,
    // Parsed leases are owned by the injecting process and cannot clean it up.
    release: async (): Promise<void> => undefined,
  };
};

const listResourceIds = async (
  run: (
    args: string[],
    stdio?: "inherit" | "pipe",
    signal?: AbortSignal,
  ) => Promise<{ stdout: string }>,
  projectName: string,
  kind: ResourceKind,
): Promise<string[]> => {
  const listArgs =
    kind === "container"
      ? ["container", "ls", "--all", "--format", "{{.ID}}"]
      : kind === "volume"
        ? ["volume", "ls", "--format", "{{.Name}}"]
        : ["network", "ls", "--format", "{{.ID}}"];
  const result = await run(
    [...listArgs, "--filter", `label=${composeProjectLabel}=${projectName}`],
    "pipe",
  );
  return result.stdout
    .split("\n")
    .map((id) => id.trim())
    .filter((id) => id !== "");
};

const resourceToken = async (
  run: (
    args: string[],
    stdio?: "inherit" | "pipe",
    signal?: AbortSignal,
  ) => Promise<{ stdout: string }>,
  kind: ResourceKind,
  id: string,
): Promise<string> => {
  const result = await run(
    [
      kind,
      "inspect",
      id,
      "--format",
      kind === "container"
        ? `{{ index .Config.Labels "${ownershipLabel}" }}`
        : `{{ index .Labels "${ownershipLabel}" }}`,
    ],
    "pipe",
  );
  return result.stdout.trim();
};

const assertProjectOwnership = async (
  run: (
    args: string[],
    stdio?: "inherit" | "pipe",
    signal?: AbortSignal,
  ) => Promise<{ stdout: string }>,
  ownership: TestServiceOwnership,
  requireResources: boolean,
): Promise<void> => {
  const resources = await Promise.all(
    (["container", "network", "volume"] as const).map(
      async (kind) =>
        [
          kind,
          await listResourceIds(run, ownership.projectName, kind),
        ] as const,
    ),
  );
  const ids = resources.flatMap(([, resourceIds]) => resourceIds);
  if (requireResources && ids.length === 0) {
    throw new Error(
      `Test service lease ${ownership.projectName} has no resources to attest`,
    );
  }
  for (const [kind, resourceIds] of resources) {
    for (const id of resourceIds) {
      const token = await resourceToken(run, kind, id);
      if (token !== ownership.token) {
        throw new Error(
          `Refusing to clean Compose project ${ownership.projectName}: ${kind} ${id} does not have this lease token`,
        );
      }
    }
  }
};

const assertHealthyServices = async (
  run: (
    args: string[],
    stdio?: "inherit" | "pipe",
    signal?: AbortSignal,
  ) => Promise<{ stdout: string }>,
  projectName: string,
): Promise<void> => {
  const services = parseComposeServices(
    (
      await run(
        [...composeArguments(projectName), "ps", "--all", "--format", "json"],
        "pipe",
      )
    ).stdout,
  );
  for (const serviceName of serviceNames) {
    const service = services.find(
      (candidate) => candidate.Service === serviceName,
    );
    if (service?.State !== "running" || service.Health !== "healthy") {
      throw new Error(
        `Test service ${serviceName} is not healthy for ${projectName}`,
      );
    }
  }
};

const assertCoordinatePorts = async (
  run: (
    args: string[],
    stdio?: "inherit" | "pipe",
    signal?: AbortSignal,
  ) => Promise<{ stdout: string }>,
  projectName: string,
  coordinates: TestServiceCoordinates,
): Promise<void> => {
  const [postgres, redis, spacy] = await Promise.all([
    run(
      [...composeArguments(projectName), "port", "postgresql", "5432"],
      "pipe",
    ),
    run([...composeArguments(projectName), "port", "redis", "6379"], "pipe"),
    run([...composeArguments(projectName), "port", "spacy", "8000"], "pipe"),
  ]);
  const expectedPorts = [
    parsePublishedPort(postgres.stdout, "PostgreSQL"),
    parsePublishedPort(redis.stdout, "Redis"),
    parsePublishedPort(spacy.stdout, "spaCy"),
  ];
  const actualPorts = [
    new URL(coordinates.databaseUrl).port,
    new URL(coordinates.redisUrl).port,
    new URL(coordinates.spacyUrl).port,
  ].map((port) => Number(port));
  if (expectedPorts.some((port, index) => port !== actualPorts[index])) {
    throw new Error(
      `Test service lease ${projectName} coordinates do not match Compose ports`,
    );
  }
};

export const attestTestServiceLease = async (
  lease: Pick<TestServiceLease, "coordinates" | "ownership">,
  options: AcquireTestServiceLeaseOptions,
): Promise<void> => {
  const environment: NodeJS.ProcessEnv = {
    ...options.environment,
    CAT_E2E_LEASE_TOKEN: lease.ownership.token,
  };
  const run = async (
    args: string[],
    stdio: "inherit" | "pipe" = "inherit",
    signal = options.signal,
  ): Promise<{ stdout: string }> =>
    await options.run("docker", args, {
      cwd: workspaceRoot,
      env: environment,
      signal,
      stdio,
    });
  await assertProjectOwnership(run, lease.ownership, true);
  await assertHealthyServices(run, lease.ownership.projectName);
  await assertCoordinatePorts(
    run,
    lease.ownership.projectName,
    lease.coordinates,
  );
};

export const acquireTestServiceLease = async (
  options: AcquireTestServiceLeaseOptions,
): Promise<TestServiceLease> => {
  const projectName = generatedProjectName();
  const token = randomUUID();
  // A lease owns service containers only. Execution cells create and destroy
  // their own databases through this admin catalog connection.
  const postgresDatabase = "postgres";
  const postgresPassword =
    options.environment.CAT_E2E_POSTGRES_PASSWORD ??
    randomUUID().replaceAll("-", "");
  const postgresUser =
    options.environment.CAT_E2E_POSTGRES_USER ?? randomIdentifier("cat");
  const redisPassword =
    options.environment.CAT_E2E_REDIS_PASSWORD ??
    randomUUID().replaceAll("-", "");
  const dockerHost =
    options.dockerHost ??
    options.environment.CAT_E2E_DOCKER_HOST ??
    defaultGateway() ??
    "127.0.0.1";
  const bindHost = assertSafeBindHost(
    options.environment.CAT_E2E_BIND_HOST ?? dockerHost,
  );
  const environment: NodeJS.ProcessEnv = {
    ...options.environment,
    CAT_E2E_BIND_HOST: bindHost,
    CAT_E2E_LEASE_TOKEN: token,
    CAT_E2E_POSTGRES_HOST_PORT: "0",
    CAT_E2E_POSTGRES_PASSWORD: postgresPassword,
    CAT_E2E_POSTGRES_USER: postgresUser,
    CAT_E2E_REDIS_HOST_PORT: "0",
    CAT_E2E_REDIS_PASSWORD: redisPassword,
    CAT_E2E_SPACY_HOST_PORT: "0",
  };
  const run = async (
    args: string[],
    stdio: "inherit" | "pipe" = "inherit",
    signal = options.signal,
  ): Promise<{ stdout: string }> =>
    await options.run("docker", args, {
      cwd: workspaceRoot,
      env: environment,
      signal,
      stdio,
    });
  const ownership = { projectName, token };
  const cleanup = async (requireResources: boolean): Promise<void> => {
    const cleanupSignal = AbortSignal.timeout(cleanupTimeoutMs);
    const cleanupRun = async (
      args: string[],
      stdio: "inherit" | "pipe" = "inherit",
    ): Promise<{ stdout: string }> =>
      await options.run("docker", args, {
        cwd: workspaceRoot,
        env: environment,
        signal: cleanupSignal,
        stdio,
      });
    await assertProjectOwnership(cleanupRun, ownership, requireResources);
    await cleanupRun(
      [
        ...composeArguments(projectName),
        "down",
        "--volumes",
        "--remove-orphans",
        "--timeout",
        String(composeShutdownSeconds),
      ],
      "inherit",
    );
  };

  let started = false;
  try {
    const existing = parseComposeServices(
      (
        await run(
          [...composeArguments(projectName), "ps", "--all", "--format", "json"],
          "pipe",
        )
      ).stdout,
    );
    if (existing.length > 0) {
      throw new Error(
        `Refusing to acquire colliding Compose project ${projectName}`,
      );
    }
    started = true;
    await run([
      ...composeArguments(projectName),
      "up",
      ...(environment.CAT_SPACY_IMAGE_ID === undefined
        ? ["--build"]
        : ["--no-build"]),
      "--detach",
      "--wait",
      "--wait-timeout",
      "300",
    ]);
    if (environment.CAT_SPACY_IMAGE_ID !== undefined) {
      const actualSpacyImage = (
        await run(
          [...composeArguments(projectName), "images", "--quiet", "spacy"],
          "pipe",
        )
      ).stdout.trim();
      const actualSpacyImageId = (
        await run(
          ["image", "inspect", "--format", "{{.Id}}", actualSpacyImage],
          "pipe",
        )
      ).stdout.trim();
      if (actualSpacyImageId !== environment.CAT_SPACY_IMAGE_ID) {
        throw new Error(
          "Test service lease did not use the immutable spaCy image ID",
        );
      }
    }
    const [postgresPort, redisPort, spacyPort] = await Promise.all([
      run(
        [...composeArguments(projectName), "port", "postgresql", "5432"],
        "pipe",
      ),
      run([...composeArguments(projectName), "port", "redis", "6379"], "pipe"),
      run([...composeArguments(projectName), "port", "spacy", "8000"], "pipe"),
    ]);
    const host = formatUrlHost(dockerHost);
    const coordinates = {
      databaseUrl: `postgresql://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@${host}:${parsePublishedPort(postgresPort.stdout, "PostgreSQL")}/${encodeURIComponent(postgresDatabase)}`,
      redisUrl: `redis://:${encodeURIComponent(redisPassword)}@${host}:${parsePublishedPort(redisPort.stdout, "Redis")}`,
      spacyUrl: `http://${host}:${parsePublishedPort(spacyPort.stdout, "spaCy")}`,
    };
    await attestTestServiceLease(
      { coordinates, ownership },
      { ...options, environment, run: options.run },
    );
    let activeBorrows = 0;
    let resolveBorrowersDrained: (() => void) | undefined;
    let releasePromise: Promise<void> | undefined;
    const borrow = (): TestServiceLeaseBorrow => {
      if (releasePromise !== undefined)
        throw new Error("Test service lease is closing");
      activeBorrows += 1;
      let released = false;
      return {
        release: async (): Promise<void> => {
          if (released) return;
          released = true;
          activeBorrows -= 1;
          if (activeBorrows === 0) resolveBorrowersDrained?.();
        },
      };
    };
    const release = async (): Promise<void> => {
      if (releasePromise !== undefined) return await releasePromise;
      releasePromise = (async (): Promise<void> => {
        if (activeBorrows > 0) {
          await new Promise<void>((resolvePromise) => {
            resolveBorrowersDrained = resolvePromise;
          });
        }
        await cleanup(true);
      })();
      return await releasePromise;
    };
    return { borrow, coordinates, ownership, release };
  } catch (error) {
    if (!started) throw error;
    try {
      await cleanup(false);
    } catch (cleanupError) {
      throw cleanupFailure(cleanupError, true, error);
    }
    throw error;
  }
};

export const runWithTestServiceLease = async <Result>(
  options: UseTestServiceLeaseOptions,
  consumer: (lease: TestServiceLease) => Promise<Result>,
): Promise<Result> => {
  const lease = options.lease ?? (await acquireTestServiceLease(options));
  const ownsLease = options.lease === undefined;
  const borrow = lease.borrow();
  let result: Result | undefined;
  let consumerFailed = false;
  let consumerFailure: unknown;
  try {
    result = await consumer(lease);
  } catch (error) {
    consumerFailed = true;
    consumerFailure = error;
  }
  try {
    await borrow.release();
    if (ownsLease) await lease.release();
  } catch (cleanupError) {
    throw cleanupFailure(cleanupError, consumerFailed, consumerFailure);
  }
  if (consumerFailed) throw consumerFailure;
  return result as Result;
};
