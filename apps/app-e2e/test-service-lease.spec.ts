import { describe, expect, it, vi } from "vitest";

import {
  acquireTestServiceLease,
  attestTestServiceLease,
  classifyHostLocality,
  parseDockerBridgeGateway,
  parseTestServiceLease,
  runWithTestServiceLease,
  serializeTestServiceLease,
  type ServiceLeaseCommandRunner,
} from "./test-service-lease.ts";

type RunnerState = {
  collides: boolean;
  mismatch: boolean;
  ndjson?: boolean;
  projectName?: string;
  started: boolean;
};

const successfulRunner = (state: RunnerState): ServiceLeaseCommandRunner =>
  vi.fn(async (_command, args, options) => {
    const projectNameIndex = args.indexOf("--project-name");
    if (projectNameIndex >= 0) {
      state.projectName = args[projectNameIndex + 1];
    }
    if (args.includes("up")) state.started = true;
    if (args.includes("images") && args.includes("spacy")) {
      return { stdout: "sha256:spacy-image\n" };
    }
    if (args[0] === "image" && args.includes("inspect")) {
      return { stdout: "sha256:spacy-image\n" };
    }
    if (
      args[0] === "container" &&
      args[1] === "inspect" &&
      args.includes("{{json .}}")
    ) {
      return {
        stdout: JSON.stringify({
          Config: {
            Labels: {
              "cat.test-service-lease.token": options.env.CAT_E2E_LEASE_TOKEN,
              "com.docker.compose.project": state.projectName,
            },
          },
          Id: `probe-id-${args[2]}`,
        }),
      };
    }
    if (args.includes("ps")) {
      if (!state.started && state.collides) {
        return {
          stdout: JSON.stringify({
            Service: "postgresql",
            State: "running",
            Health: "healthy",
          }),
        };
      }
      const services = [
        { Service: "postgresql", State: "running", Health: "healthy" },
        { Service: "redis", State: "running", Health: "healthy" },
        { Service: "spacy", State: "running", Health: "healthy" },
      ];
      return {
        stdout: state.started
          ? state.ndjson
            ? services.map((service) => JSON.stringify(service)).join("\n")
            : JSON.stringify(services)
          : "",
      };
    }
    if (args.includes("ls")) {
      if (!state.started) return { stdout: "" };
      if (args[0] === "container")
        return { stdout: "postgres\nredis\nspacy\n" };
      if (args[0] === "network") return { stdout: "network\n" };
      return { stdout: "postgres-data\nredis-data\n" };
    }
    if (args.includes("inspect")) {
      return {
        stdout: state.mismatch
          ? "other-token\n"
          : `${options.env.CAT_E2E_LEASE_TOKEN}\n`,
      };
    }
    if (args.includes("port")) {
      return {
        stdout: args.includes("postgresql")
          ? "127.0.0.1:49152\n"
          : args.includes("redis")
            ? "127.0.0.1:49153\n"
            : "127.0.0.1:49154\n",
      };
    }
    return { stdout: "" };
  });

const acquisitionOptions = (run: ServiceLeaseCommandRunner) => ({
  dockerHost: "172.17.0.1",
  environment: {},
  run,
  signal: new AbortController().signal,
  spacyReadyProbe: vi.fn(async () => undefined),
});

describe("TestServiceLease", () => {
  it.each([
    ["LOCALHOST.", "local"],
    ["127.12.34.56", "local"],
    ["::1", "local"],
    ["0:0:0:0:0:0:0:1", "local"],
    ["::ffff:127.0.0.1", "local"],
    ["::FFFF:7f00:1", "local"],
    ["0.0.0.0", "wildcard"],
    ["::", "wildcard"],
    ["0:0:0:0:0:0:0:0", "wildcard"],
    ["::ffff:0.0.0.0", "wildcard"],
    ["172.17.0.1", "external"],
  ] as const)(
    "classifies canonical local and wildcard host aliases: %s",
    (host, expected) => {
      expect(classifyHostLocality(host)).toBe(expected);
    },
  );

  it("reads a specific IPv4 gateway from Docker bridge inspection", () => {
    expect(
      parseDockerBridgeGateway(
        JSON.stringify([
          {
            IPAM: {
              Config: [{ Gateway: "172.17.0.1", Subnet: "172.17.0.0/16" }],
            },
          },
        ]),
      ),
    ).toBe("172.17.0.1");
  });

  it.each([
    "not json",
    "{}",
    "[]",
    '[{"IPAM":{"Config":[{"Gateway":"999.999.999.999"}]}}]',
    '[{"IPAM":{"Config":[{"Gateway":"0.0.0.0"}]}}]',
  ])("rejects an unusable Docker bridge inspection: %s", (inspection) => {
    expect(parseDockerBridgeGateway(inspection)).toBeUndefined();
  });

  it("owns a generated, isolated dynamic-port service set and releases it after a direct consumer", async () => {
    const state = {
      collides: false,
      mismatch: false,
      ndjson: true,
      started: false,
    };
    const run = successfulRunner(state);
    const observed = await runWithTestServiceLease(
      acquisitionOptions(run),
      async (lease) => lease,
    );

    expect(observed.ownership).toMatchObject({
      projectName: expect.stringMatching(/^cat-e2e-\d+-[a-f\d]{32}$/),
      token: expect.any(String),
    });
    expect(observed.coordinates).toEqual({
      databaseUrl: expect.stringMatching(/\/postgres$/),
      redisUrl: expect.stringMatching(/^redis:\/\/:[^@]+@172\.17\.0\.1:49153$/),
      spacyUrl: "http://172.17.0.1:49154",
    });
    expect(observed.databaseCleanup).toBe("lease-volume");
    const up = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("up"));
    expect(up?.[2].env.CAT_E2E_LEASE_TOKEN).toBe(observed.ownership.token);
    expect(up?.[1]).toEqual(
      expect.arrayContaining([
        "compose",
        "--progress",
        "quiet",
        "--wait-timeout",
        "510",
      ]),
    );
    expect(vi.mocked(run).mock.calls.at(-1)?.[1]).toEqual(
      expect.arrayContaining([
        "compose",
        "--progress",
        "quiet",
        "down",
        "--volumes",
        "--remove-orphans",
      ]),
    );
  });

  it("refuses a project collision before creating or deleting resources", async () => {
    const state = { collides: true, mismatch: false, started: false };
    const run = successfulRunner(state);

    await expect(
      acquireTestServiceLease(acquisitionOptions(run)),
    ).rejects.toThrow("colliding Compose project");
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args.includes("up")),
    ).toBe(false);
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args.includes("down")),
    ).toBe(false);
  });

  it.each([
    "127.0.0.1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0.0.0.0",
    "0:0:0:0:0:0:0:0",
    "::ffff:0.0.0.0",
  ])(
    "rejects unsafe direct bind host before creating services: %s",
    async (dockerHost) => {
      const state = { collides: false, mismatch: false, started: false };
      const run = successfulRunner(state);

      await expect(
        acquireTestServiceLease({ ...acquisitionOptions(run), dockerHost }),
      ).rejects.toThrow(/specific host|non-loopback/);
      expect(vi.mocked(run)).not.toHaveBeenCalled();
    },
  );

  it("refuses cleanup when any project resource has another lease token", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const run = successfulRunner(state);
    const lease = await acquireTestServiceLease(acquisitionOptions(run));
    state.mismatch = true;

    await expect(lease.release()).rejects.toThrow(
      "does not have this lease token",
    );
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args.includes("down")),
    ).toBe(false);
  });

  it("cleans only its token-attested resources after startup fails", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        const result = await successful(command, args, options);
        if (args.includes("up"))
          throw new Error("spaCy did not become healthy");
        return result;
      },
    );

    await expect(
      acquireTestServiceLease(acquisitionOptions(run)),
    ).rejects.toThrow("spaCy did not become healthy");
    const cleanup = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("down"));
    const logs = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("logs"));
    expect(logs?.[1]).toEqual(
      expect.arrayContaining(["compose", "logs", "--no-color"]),
    );
    expect(logs?.[2].stdio).toBe("inherit");
    expect(vi.mocked(run).mock.calls.indexOf(logs as never)).toBeLessThan(
      vi.mocked(run).mock.calls.indexOf(cleanup as never),
    );
    expect(cleanup?.[2].env.CAT_E2E_LEASE_TOKEN).toEqual(expect.any(String));
  });

  it("cleans its token-attested resources when host spaCy reachability fails", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const run = successfulRunner(state);
    const probe = vi.fn(async () => {
      throw new Error("host cannot reach spaCy");
    });

    await expect(
      acquireTestServiceLease({
        ...acquisitionOptions(run),
        spacyReadyProbe: probe,
      }),
    ).rejects.toThrow("Host cannot reach ready spaCy");
    expect(probe).toHaveBeenCalledOnce();
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args.includes("down")),
    ).toBe(true);
  });

  it("cleans its token-attested resources when the independent service-network probe fails", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        const result = await successful(command, args, options);
        if (args[0] === "run") throw new Error("connection refused");
        return result;
      },
    );

    await expect(
      acquireTestServiceLease(acquisitionOptions(run)),
    ).rejects.toThrow(
      "Independent service-network probe cannot reach ready spaCy",
    );
    expect(
      vi
        .mocked(run)
        .mock.calls.some(
          ([, args]) => args[0] === "run" && args.includes("--rm"),
        ),
    ).toBe(true);
    expect(vi.mocked(run).mock.calls.some(([, args]) => args[0] === "rm")).toBe(
      true,
    );
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args.includes("down")),
    ).toBe(true);
  });

  it("proves an injected lease's spaCy URL from the host and an independent service-network probe", async () => {
    const state = { collides: false, mismatch: false, started: true };
    const run = successfulRunner(state);
    const probe = vi.fn(async () => undefined);
    const lease = {
      coordinates: {
        databaseUrl: "postgresql://user:pass@172.17.0.1:49152/postgres",
        redisUrl: "redis://:pass@172.17.0.1:49153",
        spacyUrl: "http://172.17.0.1:49154",
      },
      ownership: { projectName: "cat-e2e-injected", token: "lease-token" },
    };

    await attestTestServiceLease(lease, {
      ...acquisitionOptions(run),
      spacyReadyProbe: probe,
    });

    expect(probe).toHaveBeenCalledWith(
      lease.coordinates.spacyUrl,
      expect.any(AbortSignal),
    );
    expect(
      vi
        .mocked(run)
        .mock.calls.some(
          ([, args]) =>
            args[0] === "run" &&
            args.includes("--rm") &&
            args.includes("cat-e2e-injected_default") &&
            args.includes("sha256:spacy-image") &&
            args.includes(lease.coordinates.spacyUrl),
        ),
    ).toBe(true);
    const probeRun = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "run");
    const probeInspection = vi
      .mocked(run)
      .mock.calls.find(
        ([, args]) =>
          args[0] === "container" &&
          args[1] === "inspect" &&
          args.includes("{{json .}}"),
      );
    const probeCleanup = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "rm");
    expect(probeRun?.[1]).toEqual(
      expect.arrayContaining([
        "--name",
        expect.stringMatching(/^cat-e2e-probe-/),
        "--label",
        "com.docker.compose.project=cat-e2e-injected",
        "cat.test-service-lease.token=lease-token",
      ]),
    );
    const probeName = probeRun?.[1][probeRun[1].indexOf("--name") + 1];
    expect(probeInspection?.[1]).toEqual([
      "container",
      "inspect",
      probeName,
      "--format",
      "{{json .}}",
    ]);
    expect(probeCleanup?.[1]).toEqual([
      "rm",
      "--force",
      `probe-id-${probeName}`,
    ]);
    expect(vi.mocked(run).mock.calls.indexOf(probeRun as never)).toBeLessThan(
      vi.mocked(run).mock.calls.indexOf(probeInspection as never),
    );
    expect(
      vi.mocked(run).mock.calls.indexOf(probeInspection as never),
    ).toBeLessThan(vi.mocked(run).mock.calls.indexOf(probeCleanup as never));
  });

  it("removes a named probe with an independent timeout after probe creation is aborted", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const controller = new AbortController();
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        const result = await successful(command, args, options);
        if (args[0] === "run") {
          controller.abort(new Error("probe interrupted after creation"));
          throw controller.signal.reason;
        }
        return result;
      },
    );

    await expect(
      acquireTestServiceLease({
        ...acquisitionOptions(run),
        signal: controller.signal,
      }),
    ).rejects.toThrow(
      "Independent service-network probe cannot reach ready spaCy",
    );
    const probeCleanup = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "rm");
    const composeCleanup = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("down"));
    expect(probeCleanup?.[2].signal).not.toBe(controller.signal);
    expect(
      vi.mocked(run).mock.calls.indexOf(probeCleanup as never),
    ).toBeLessThan(vi.mocked(run).mock.calls.indexOf(composeCleanup as never));
  });

  it("does not remove a missing probe container", async () => {
    const state = { collides: false, mismatch: false, started: true };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        if (
          args[0] === "container" &&
          args[1] === "inspect" &&
          args.includes("{{json .}}")
        ) {
          throw new Error("No such container");
        }
        return await successful(command, args, options);
      },
    );
    const lease = {
      coordinates: {
        databaseUrl: "postgresql://user:pass@172.17.0.1:49152/postgres",
        redisUrl: "redis://:pass@172.17.0.1:49153",
        spacyUrl: "http://172.17.0.1:49154",
      },
      ownership: { projectName: "cat-e2e-injected", token: "lease-token" },
    };

    await expect(
      attestTestServiceLease(lease, {
        ...acquisitionOptions(run),
        spacyReadyProbe: vi.fn(async () => undefined),
      }),
    ).resolves.toBeUndefined();
    expect(vi.mocked(run).mock.calls.some(([, args]) => args[0] === "rm")).toBe(
      false,
    );
  });

  it("ignores a probe removed between ownership inspection and cleanup", async () => {
    const state = { collides: false, mismatch: false, started: true };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        if (args[0] === "rm") {
          throw new Error("Error response from daemon: No such container");
        }
        return await successful(command, args, options);
      },
    );
    const lease = {
      coordinates: {
        databaseUrl: "postgresql://user:pass@172.17.0.1:49152/postgres",
        redisUrl: "redis://:pass@172.17.0.1:49153",
        spacyUrl: "http://172.17.0.1:49154",
      },
      ownership: { projectName: "cat-e2e-injected", token: "lease-token" },
    };

    await expect(
      attestTestServiceLease(lease, {
        ...acquisitionOptions(run),
        spacyReadyProbe: vi.fn(async () => undefined),
      }),
    ).resolves.toBeUndefined();
    const cleanup = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args[0] === "rm");
    expect(cleanup?.[2].stdio).toBe("pipe");
  });

  it("does not mistake a Docker context failure for a missing probe", async () => {
    const state = { collides: false, mismatch: false, started: true };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        if (
          args[0] === "container" &&
          args[1] === "inspect" &&
          args.includes("{{json .}}")
        ) {
          throw new Error('Docker context "unavailable" not found');
        }
        return await successful(command, args, options);
      },
    );
    const lease = {
      coordinates: {
        databaseUrl: "postgresql://user:pass@172.17.0.1:49152/postgres",
        redisUrl: "redis://:pass@172.17.0.1:49153",
        spacyUrl: "http://172.17.0.1:49154",
      },
      ownership: { projectName: "cat-e2e-injected", token: "lease-token" },
    };

    await expect(
      attestTestServiceLease(lease, {
        ...acquisitionOptions(run),
        spacyReadyProbe: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow('Docker context "unavailable" not found');
    expect(vi.mocked(run).mock.calls.some(([, args]) => args[0] === "rm")).toBe(
      false,
    );
  });

  it.each([
    {
      labels: {
        "cat.test-service-lease.token": "lease-token",
        "com.docker.compose.project": "other-project",
      },
      name: "another lease project",
    },
    {
      labels: {
        "cat.test-service-lease.token": "other-token",
        "com.docker.compose.project": "cat-e2e-injected",
      },
      name: "another lease token",
    },
  ])("refuses to remove a probe owned by $name", async ({ labels }) => {
    const state = { collides: false, mismatch: false, started: true };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        if (
          args[0] === "container" &&
          args[1] === "inspect" &&
          args.includes("{{json .}}")
        ) {
          return {
            stdout: JSON.stringify({
              Config: { Labels: labels },
              Id: "foreign-probe-id",
            }),
          };
        }
        return await successful(command, args, options);
      },
    );
    const lease = {
      coordinates: {
        databaseUrl: "postgresql://user:pass@172.17.0.1:49152/postgres",
        redisUrl: "redis://:pass@172.17.0.1:49153",
        spacyUrl: "http://172.17.0.1:49154",
      },
      ownership: { projectName: "cat-e2e-injected", token: "lease-token" },
    };

    await expect(
      attestTestServiceLease(lease, {
        ...acquisitionOptions(run),
        spacyReadyProbe: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("Refusing to remove spaCy probe container");
    expect(vi.mocked(run).mock.calls.some(([, args]) => args[0] === "rm")).toBe(
      false,
    );
  });

  it("uses distinct immutable cleanup targets for concurrent probes", async () => {
    const state = { collides: false, mismatch: false, started: true };
    const run = successfulRunner(state);
    const lease = {
      coordinates: {
        databaseUrl: "postgresql://user:pass@172.17.0.1:49152/postgres",
        redisUrl: "redis://:pass@172.17.0.1:49153",
        spacyUrl: "http://172.17.0.1:49154",
      },
      ownership: { projectName: "cat-e2e-injected", token: "lease-token" },
    };
    const options = {
      ...acquisitionOptions(run),
      spacyReadyProbe: vi.fn(async () => undefined),
    };

    await Promise.all([
      attestTestServiceLease(lease, options),
      attestTestServiceLease(lease, options),
    ]);

    const probeNames = vi
      .mocked(run)
      .mock.calls.filter(([, args]) => args[0] === "run")
      .map(([, args]) => args[args.indexOf("--name") + 1]);
    expect(new Set(probeNames)).toHaveLength(2);
    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args[0] === "rm"),
    ).toHaveLength(2);
    expect(
      vi
        .mocked(run)
        .mock.calls.filter(([, args]) => args[0] === "rm")
        .map(([, args]) => args[2]),
    ).toEqual(probeNames.map((name) => `probe-id-${name}`));
  });

  it("keeps probe and probe-cleanup failures together", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        const result = await successful(command, args, options);
        if (args[0] === "run") throw new Error("probe request failed");
        if (args[0] === "rm") throw new Error("probe cleanup failed");
        return result;
      },
    );

    const result = await acquireTestServiceLease(acquisitionOptions(run)).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(result).toBeInstanceOf(AggregateError);
    const [probeError, cleanupError] = (result as AggregateError).errors;
    expect(probeError).toBeInstanceOf(Error);
    expect((probeError as Error).message).toContain(
      "Independent service-network probe cannot reach ready spaCy",
    );
    expect(cleanupError).toBeInstanceOf(Error);
    expect((cleanupError as Error).message).toBe("probe cleanup failed");
  });

  it("rejects an injected loopback lease before probing or using its resources", async () => {
    const state = { collides: false, mismatch: false, started: true };
    const run = successfulRunner(state);
    const probe = vi.fn(async () => undefined);

    await expect(
      attestTestServiceLease(
        {
          coordinates: {
            databaseUrl: "postgresql://user:pass@127.0.0.1:49152/postgres",
            redisUrl: "redis://:pass@127.0.0.1:49153",
            spacyUrl: "http://127.0.0.1:49154",
          },
          ownership: { projectName: "cat-e2e-injected", token: "lease-token" },
        },
        { ...acquisitionOptions(run), spacyReadyProbe: probe },
      ),
    ).rejects.toThrow("cannot reach local or wildcard endpoints");
    expect(probe).not.toHaveBeenCalled();
    expect(vi.mocked(run)).not.toHaveBeenCalled();
  });

  it("prints native Compose logs before cleanup when lease attestation fails", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        const result = await successful(command, args, options);
        if (args.includes("port")) throw new Error("published port mismatch");
        return result;
      },
    );

    await expect(
      acquireTestServiceLease(acquisitionOptions(run)),
    ).rejects.toThrow("published port mismatch");
    const logs = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("logs"));
    const cleanup = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("down"));
    expect(logs?.[2].stdio).toBe("inherit");
    expect(vi.mocked(run).mock.calls.indexOf(logs as never)).toBeLessThan(
      vi.mocked(run).mock.calls.indexOf(cleanup as never),
    );
  });

  it("releases token-attested resources when acquisition is aborted during compose up", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const controller = new AbortController();
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        const result = await successful(command, args, options);
        if (args.includes("up")) {
          controller.abort(new Error("interrupted"));
          throw controller.signal.reason;
        }
        return result;
      },
    );

    await expect(
      acquireTestServiceLease({
        ...acquisitionOptions(run),
        signal: controller.signal,
      }),
    ).rejects.toThrow("interrupted");
    const cleanup = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("down"));
    const logs = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("logs"));
    expect(logs?.[2].signal).not.toBe(controller.signal);
    expect(cleanup?.[2].signal).not.toBe(controller.signal);
    expect(cleanup?.[2].env.CAT_E2E_LEASE_TOKEN).toEqual(expect.any(String));
  });

  it("keeps the acquisition failure and cleans up when Compose log output fails", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const successful = successfulRunner(state);
    const run: ServiceLeaseCommandRunner = vi.fn(
      async (command, args, options) => {
        const result = await successful(command, args, options);
        if (args.includes("up"))
          throw new Error("spaCy did not become healthy");
        if (args.includes("logs")) throw new Error("Compose logs unavailable");
        return result;
      },
    );

    await expect(
      acquireTestServiceLease(acquisitionOptions(run)),
    ).rejects.toThrow("spaCy did not become healthy");
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args.includes("logs")),
    ).toBe(true);
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args.includes("down")),
    ).toBe(true);
  });

  it("uses an injected lease without acquiring or releasing services", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const run = successfulRunner(state);
    const externalLease = await acquireTestServiceLease(
      acquisitionOptions(run),
    );
    const callsBeforeConsumption = vi.mocked(run).mock.calls.length;

    const result = await runWithTestServiceLease(
      { ...acquisitionOptions(run), lease: externalLease },
      async (lease) => serializeTestServiceLease(lease),
    );

    expect(result).toContain(externalLease.ownership.token);
    expect(JSON.parse(result)).toMatchObject({
      databaseCleanup: "lease-volume",
      version: 2,
    });
    expect(vi.mocked(run).mock.calls).toHaveLength(callsBeforeConsumption);
    await externalLease.release();
  });

  it("waits for borrowers and shares a single cleanup promise", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const run = successfulRunner(state);
    const lease = await acquireTestServiceLease(acquisitionOptions(run));
    const borrower = lease.borrow();
    const firstRelease = lease.release();
    const secondRelease = lease.release();

    await Promise.resolve();
    expect(
      vi.mocked(run).mock.calls.some(([, args]) => args.includes("down")),
    ).toBe(false);
    await borrower.release();
    await Promise.all([firstRelease, secondRelease]);
    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args.includes("down")),
    ).toHaveLength(1);
  });

  it("keeps the same cleanup failure for concurrent releases", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const run = successfulRunner(state);
    vi.mocked(run).mockImplementation(async (command, args, options) => {
      const result = await successfulRunner(state)(command, args, options);
      if (args.includes("down")) throw new Error("cleanup timed out");
      return result;
    });
    const lease = await acquireTestServiceLease(acquisitionOptions(run));

    const [first, second] = await Promise.allSettled([
      lease.release(),
      lease.release(),
    ]);
    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    if (first.status === "rejected" && second.status === "rejected") {
      expect(second.reason).toBe(first.reason);
    }
    expect(
      vi.mocked(run).mock.calls.filter(([, args]) => args.includes("down")),
    ).toHaveLength(1);
  });

  it("parses only the versioned strict lease schema and validates URI protocols", () => {
    const valid = JSON.stringify({
      coordinates: {
        databaseUrl: "postgresql://user:pass@172.17.0.1:5432/cat",
        redisUrl: "redis://:pass@172.17.0.1:6379",
        spacyUrl: "https://172.17.0.1:8000",
      },
      ownership: { projectName: "cat-e2e-1", token: "token" },
      version: 1,
    });
    const legacyLease = parseTestServiceLease(valid);
    expect(legacyLease.ownership.token).toBe("token");
    expect(legacyLease.databaseCleanup).toBe("cell-drop");
    expect(
      parseTestServiceLease(
        JSON.stringify({
          ...JSON.parse(valid),
          databaseCleanup: "lease-volume",
          version: 2,
        }),
      ).databaseCleanup,
    ).toBe("lease-volume");
    expect(() =>
      parseTestServiceLease(
        JSON.stringify({ ...JSON.parse(valid), extra: true }),
      ),
    ).toThrow("invalid root fields");
    expect(() =>
      parseTestServiceLease(valid.replace("postgresql:", "mysql:")),
    ).toThrow("databaseUrl must use");
    expect(() =>
      parseTestServiceLease(
        JSON.stringify({
          ...JSON.parse(valid),
          databaseCleanup: "invalid",
          version: 2,
        }),
      ),
    ).toThrow("databaseCleanup must be");
    for (const host of [
      "LOCALHOST.",
      "127.0.0.1.",
      "[::1]",
      "[0:0:0:0:0:0:0:1]",
      "[::ffff:127.0.0.1]",
      "[::ffff:7f00:1]",
      "0.0.0.0",
      "[::]",
      "[0:0:0:0:0:0:0:0]",
      "[::ffff:0.0.0.0]",
    ]) {
      expect(() =>
        parseTestServiceLease(valid.replaceAll("172.17.0.1", host)),
      ).toThrow("cannot reach local or wildcard endpoints");
    }
  });

  it("preserves a rejection with undefined while also reporting cleanup failure", async () => {
    const state = { collides: false, mismatch: false, started: false };
    const run = successfulRunner(state);
    vi.mocked(run).mockImplementation(async (command, args, options) => {
      const result = await successfulRunner(state)(command, args, options);
      if (args.includes("down")) throw new Error("cleanup timed out");
      return result;
    });

    await expect(
      runWithTestServiceLease(
        acquisitionOptions(run),
        async () => await Promise.reject(undefined),
      ),
    ).rejects.toMatchObject({
      errors: [
        undefined,
        expect.objectContaining({ message: "cleanup timed out" }),
      ],
    });
  });
});
