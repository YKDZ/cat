import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { BlockList, isIP, SocketAddress } from "node:net";
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

export type SpacyReadyProbe = (
  url: string,
  signal: AbortSignal,
) => Promise<void>;

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

export type TestServiceDatabaseCleanup = "cell-drop" | "lease-volume";

export interface TestServiceLease {
  borrow: () => TestServiceLeaseBorrow;
  coordinates: TestServiceCoordinates;
  databaseCleanup: TestServiceDatabaseCleanup;
  ownership: TestServiceOwnership;
  release: () => Promise<void>;
}

export interface AcquireTestServiceLeaseOptions {
  dockerHost?: string;
  environment: NodeJS.ProcessEnv;
  run: ServiceLeaseCommandRunner;
  signal: AbortSignal;
  spacyReadyProbe?: SpacyReadyProbe;
}

export interface UseTestServiceLeaseOptions extends AcquireTestServiceLeaseOptions {
  lease?: TestServiceLease;
}

const workspaceRoot = resolve(import.meta.dirname, "../..");
const composeFile = resolve(import.meta.dirname, "compose.e2e.yaml");
const cleanupTimeoutMs = 60_000;
const composeShutdownSeconds = 15;
// Matches the spaCy cold-start budget in apps/spacy-server/src/startup_budget.py.
const spacyServiceStartupTimeoutSeconds = 480;
const spacyReachabilityTimeoutMs = 5_000;
const ownershipLabel = "cat.test-service-lease.token";
const composeProjectLabel = "com.docker.compose.project";
const serviceNames = ["postgresql", "redis", "spacy"] as const;
const ipv4LoopbackBlockList = new BlockList();

ipv4LoopbackBlockList.addSubnet("127.0.0.0", 8, "ipv4");

type ResourceKind = "container" | "network" | "volume";
type ComposeService = {
  Health?: string;
  Name?: string;
  Service?: string;
  State?: string;
};
type ProbeContainerInspection = {
  Config?: { Labels?: Record<string, string> };
  Id?: string;
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

export type HostLocality = "external" | "local" | "wildcard";

const normalizeHost = (value: string): string =>
  value
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/g, "")
    .toLowerCase();

export const classifyHostLocality = (value: string): HostLocality => {
  const host = normalizeHost(value);
  if (host === "localhost") return "local";
  const family = isIP(host);
  if (family === 4) {
    if (host === "0.0.0.0") return "wildcard";
    return ipv4LoopbackBlockList.check(host, "ipv4") ? "local" : "external";
  }
  if (family === 6) {
    const canonicalHost = new SocketAddress({
      address: host,
      family: "ipv6",
    }).address;
    if (canonicalHost === "::") return "wildcard";
    if (canonicalHost === "::1") return "local";
    if (canonicalHost === "::ffff:0.0.0.0") return "wildcard";
    if (ipv4LoopbackBlockList.check(canonicalHost, "ipv6")) {
      return "local";
    }
  }
  return "external";
};

export const parseDockerBridgeGateway = (value: string): string | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const gateway = parsed
    .flatMap((network) => {
      if (typeof network !== "object" || network === null) return [];
      const ipam = Reflect.get(network, "IPAM");
      if (typeof ipam !== "object" || ipam === null) return [];
      const config = Reflect.get(ipam, "Config");
      return Array.isArray(config) ? config : [];
    })
    .map((config) => {
      if (typeof config !== "object" || config === null) return undefined;
      const candidate = Reflect.get(config, "Gateway");
      return typeof candidate === "string" ? candidate : undefined;
    })
    .find((candidate) =>
      candidate === undefined
        ? false
        : isIP(candidate) === 4 &&
          classifyHostLocality(candidate) === "external",
    );
  return gateway;
};

const discoverDockerBridgeGateway = async (
  options: AcquireTestServiceLeaseOptions,
): Promise<string | undefined> => {
  try {
    const result = await options.run(
      "docker",
      ["network", "inspect", "bridge"],
      {
        cwd: workspaceRoot,
        env: options.environment,
        signal: options.signal,
        stdio: "pipe",
      },
    );
    return parseDockerBridgeGateway(result.stdout);
  } catch {
    return undefined;
  }
};

const assertSafeBindHost = (host: string): string => {
  const locality = classifyHostLocality(host);
  if (locality === "wildcard")
    throw new Error("Test service ports must bind to a specific host");
  if (locality === "local")
    throw new Error(
      "Test service leases require a Docker bridge gateway or explicit non-loopback CAT_E2E_DOCKER_HOST; release containers cannot reach loopback endpoints.",
    );
  return host;
};

const assertNonLoopbackLeaseUrl = (value: string, name: string): string => {
  const url = new URL(value);
  const locality = classifyHostLocality(url.hostname);
  if (locality !== "external") {
    throw new Error(
      `CAT_TEST_SERVICE_LEASE ${name} must use a Docker bridge gateway or explicit non-loopback CAT_E2E_DOCKER_HOST; release containers cannot reach local or wildcard endpoints.`,
    );
  }
  return value;
};

export const probeSpacyReady: SpacyReadyProbe = async (url, signal) => {
  const response = await fetch(new URL("/ready", url), {
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(spacyReachabilityTimeoutMs),
    ]),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(`spaCy readiness probe returned invalid JSON for ${url}`);
  }
  if (
    !response.ok ||
    typeof body !== "object" ||
    body === null ||
    Reflect.get(body, "status") !== "ready"
  ) {
    throw new Error(`spaCy readiness probe did not report ready for ${url}`);
  }
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

const isDockerResourceNotFound = (error: unknown): boolean =>
  /no such (?:container|object)|(?:container|object) .* not found/i.test(
    error instanceof Error ? error.message : String(error),
  );

const inspectOwnedProbeContainer = async (
  run: (
    args: string[],
    stdio?: "inherit" | "pipe",
    signal?: AbortSignal,
  ) => Promise<{ stdout: string }>,
  name: string,
  ownership: TestServiceOwnership,
): Promise<string | undefined> => {
  let output: string;
  try {
    output = (
      await run(
        ["container", "inspect", name, "--format", "{{json .}}"],
        "pipe",
        AbortSignal.timeout(cleanupTimeoutMs),
      )
    ).stdout;
  } catch (error) {
    if (isDockerResourceNotFound(error)) return undefined;
    throw error;
  }
  let inspection: unknown;
  try {
    inspection = JSON.parse(output) as unknown;
  } catch {
    throw new Error(`Could not inspect spaCy probe container ${name}`);
  }
  if (!isRecord(inspection)) {
    throw new Error(`Could not inspect spaCy probe container ${name}`);
  }
  const { Config: config, Id: id } = inspection as ProbeContainerInspection;
  const labels = config?.Labels;
  if (typeof id !== "string" || id === "" || labels === undefined) {
    throw new Error(`Could not inspect spaCy probe container ${name}`);
  }
  if (
    labels[composeProjectLabel] !== ownership.projectName ||
    labels[ownershipLabel] !== ownership.token
  ) {
    throw new Error(
      `Refusing to remove spaCy probe container ${name}: it does not belong to test service lease ${ownership.projectName}`,
    );
  }
  return id;
};

const noopBorrow = (): TestServiceLeaseBorrow => ({
  release: async (): Promise<void> => undefined,
});

export const serializeTestServiceLease = (lease: TestServiceLease): string =>
  JSON.stringify({
    coordinates: lease.coordinates,
    databaseCleanup: lease.databaseCleanup,
    ownership: lease.ownership,
    version: 2,
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
  if (parsed.version === 1) {
    assertExactKeys(parsed, ["version", "coordinates", "ownership"], "root");
  } else if (parsed.version === 2) {
    assertExactKeys(
      parsed,
      ["version", "coordinates", "databaseCleanup", "ownership"],
      "root",
    );
  } else {
    throw new Error("CAT_TEST_SERVICE_LEASE must use schema version 1 or 2");
  }
  if (!isRecord(parsed.coordinates) || !isRecord(parsed.ownership)) {
    throw new Error("CAT_TEST_SERVICE_LEASE has invalid root fields");
  }
  const databaseCleanup: TestServiceDatabaseCleanup =
    parsed.version === 1
      ? "cell-drop"
      : parsed.databaseCleanup === "cell-drop" ||
          parsed.databaseCleanup === "lease-volume"
        ? parsed.databaseCleanup
        : (() => {
            throw new Error(
              "CAT_TEST_SERVICE_LEASE databaseCleanup must be cell-drop or lease-volume",
            );
          })();
  assertExactKeys(
    parsed.coordinates,
    ["databaseUrl", "redisUrl", "spacyUrl"],
    "coordinates",
  );
  assertExactKeys(parsed.ownership, ["projectName", "token"], "ownership");
  const coordinates = {
    databaseUrl: assertNonLoopbackLeaseUrl(
      assertProtocol(
        assertNonEmptyString(parsed.coordinates.databaseUrl, "databaseUrl"),
        "databaseUrl",
        ["postgresql:"],
      ),
      "databaseUrl",
    ),
    redisUrl: assertNonLoopbackLeaseUrl(
      assertProtocol(
        assertNonEmptyString(parsed.coordinates.redisUrl, "redisUrl"),
        "redisUrl",
        ["redis:"],
      ),
      "redisUrl",
    ),
    spacyUrl: assertNonLoopbackLeaseUrl(
      assertProtocol(
        assertNonEmptyString(parsed.coordinates.spacyUrl, "spacyUrl"),
        "spacyUrl",
        ["http:", "https:"],
      ),
      "spacyUrl",
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
    databaseCleanup,
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

const assertSpaCyReachability = async (
  run: (
    args: string[],
    stdio?: "inherit" | "pipe",
    signal?: AbortSignal,
  ) => Promise<{ stdout: string }>,
  ownership: TestServiceOwnership,
  spacyUrl: string,
  probe: SpacyReadyProbe,
  signal: AbortSignal,
): Promise<void> => {
  const probeSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(spacyReachabilityTimeoutMs),
  ]);
  try {
    await probe(spacyUrl, probeSignal);
  } catch (error) {
    throw new Error(
      `Host cannot reach ready spaCy at the shared lease endpoint ${spacyUrl}.`,
      { cause: error },
    );
  }
  const probeImage = (
    await run(
      [
        ...composeArguments(ownership.projectName),
        "images",
        "--quiet",
        "spacy",
      ],
      "pipe",
      probeSignal,
    )
  ).stdout.trim();
  if (probeImage === "") {
    throw new Error(
      `Test service ${ownership.projectName} has no available spaCy image for an independent network probe`,
    );
  }
  const probeImageId = (
    await run(
      ["image", "inspect", "--format", "{{.Id}}", probeImage],
      "pipe",
      probeSignal,
    )
  ).stdout.trim();
  if (!probeImageId.startsWith("sha256:")) {
    throw new Error(
      `Test service ${ownership.projectName} could not attest an immutable spaCy probe image`,
    );
  }
  const probeContainerName = `cat-e2e-probe-${randomUUID().replaceAll("-", "")}`;
  let probeFailure: unknown;
  let probeCleanupFailure: unknown;
  try {
    await run(
      [
        "run",
        "--rm",
        "--name",
        probeContainerName,
        "--label",
        `${composeProjectLabel}=${ownership.projectName}`,
        "--label",
        `${ownershipLabel}=${ownership.token}`,
        "--network",
        `${ownership.projectName}_default`,
        "--entrypoint",
        "python",
        probeImageId,
        "-c",
        [
          "import json",
          "import sys",
          "import urllib.request",
          "url = sys.argv[1].rstrip('/') + '/ready'",
          "with urllib.request.urlopen(url, timeout=5) as response:",
          "    body = json.load(response)",
          "if body.get('status') != 'ready': raise SystemExit(1)",
        ].join("\n"),
        spacyUrl,
      ],
      "inherit",
      probeSignal,
    );
  } catch (error) {
    probeFailure = new Error(
      `Independent service-network probe cannot reach ready spaCy at the shared lease endpoint ${spacyUrl}.`,
      { cause: error },
    );
  } finally {
    try {
      const probeContainerId = await inspectOwnedProbeContainer(
        run,
        probeContainerName,
        ownership,
      );
      if (probeContainerId !== undefined) {
        await run(
          ["rm", "--force", probeContainerId],
          "pipe",
          AbortSignal.timeout(cleanupTimeoutMs),
        );
      }
    } catch (cleanupError) {
      if (!isDockerResourceNotFound(cleanupError)) {
        probeCleanupFailure = cleanupError;
      }
    }
  }
  if (probeFailure !== undefined && probeCleanupFailure !== undefined) {
    throw new AggregateError(
      [probeFailure, probeCleanupFailure],
      "spaCy service-network probe and cleanup both failed",
    );
  }
  if (probeFailure !== undefined) throw probeFailure;
  if (probeCleanupFailure !== undefined) throw probeCleanupFailure;
};

export const attestTestServiceLease = async (
  lease: Pick<TestServiceLease, "coordinates" | "ownership">,
  options: AcquireTestServiceLeaseOptions,
): Promise<void> => {
  assertNonLoopbackLeaseUrl(lease.coordinates.databaseUrl, "databaseUrl");
  assertNonLoopbackLeaseUrl(lease.coordinates.redisUrl, "redisUrl");
  assertNonLoopbackLeaseUrl(lease.coordinates.spacyUrl, "spacyUrl");
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
  await assertSpaCyReachability(
    run,
    lease.ownership,
    assertNonLoopbackLeaseUrl(lease.coordinates.spacyUrl, "spacyUrl"),
    options.spacyReadyProbe ?? probeSpacyReady,
    options.signal,
  );
};

export const acquireTestServiceLease = async (
  options: AcquireTestServiceLeaseOptions,
): Promise<TestServiceLease> => {
  const projectName = generatedProjectName();
  const token = randomUUID();
  // This lease owns unique service volumes, which are the physical database
  // cleanup boundary after every borrower has finished.
  const postgresDatabase = "postgres";
  const postgresPassword =
    options.environment.CAT_E2E_POSTGRES_PASSWORD ??
    randomUUID().replaceAll("-", "");
  const postgresUser =
    options.environment.CAT_E2E_POSTGRES_USER ?? randomIdentifier("cat");
  const redisPassword =
    options.environment.CAT_E2E_REDIS_PASSWORD ??
    randomUUID().replaceAll("-", "");
  const resolvedDockerHost =
    options.dockerHost ??
    options.environment.CAT_E2E_DOCKER_HOST ??
    defaultGateway() ??
    (await discoverDockerBridgeGateway(options));
  if (resolvedDockerHost === undefined) {
    throw new Error(
      "Could not discover a Docker bridge gateway. Set CAT_E2E_DOCKER_HOST to a non-loopback address reachable from both the host and release containers.",
    );
  }
  const dockerHost = assertSafeBindHost(resolvedDockerHost);
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
  const printComposeLogs = async (): Promise<void> => {
    const diagnosticSignal = AbortSignal.timeout(cleanupTimeoutMs);
    try {
      await options.run(
        "docker",
        [...composeArguments(projectName), "logs", "--no-color"],
        {
          cwd: workspaceRoot,
          env: environment,
          signal: diagnosticSignal,
          stdio: "inherit",
        },
      );
    } catch {
      // Compose logs are diagnostic only; preserve the acquisition failure.
    }
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
      String(spacyServiceStartupTimeoutSeconds),
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
    return {
      borrow,
      coordinates,
      databaseCleanup: "lease-volume",
      ownership,
      release,
    };
  } catch (error) {
    if (!started) throw error;
    await printComposeLogs();
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
