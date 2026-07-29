import { describe, expect, it, vi } from "vitest";

import {
  acquireTestServiceLease,
  parseTestServiceLease,
  runWithTestServiceLease,
  serializeTestServiceLease,
  type ServiceLeaseCommandRunner,
} from "./test-service-lease.ts";

type RunnerState = {
  collides: boolean;
  mismatch: boolean;
  ndjson?: boolean;
  started: boolean;
};

const successfulRunner = (state: RunnerState): ServiceLeaseCommandRunner =>
  vi.fn(async (_command, args, options) => {
    if (args.includes("up")) state.started = true;
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
  dockerHost: "127.0.0.1",
  environment: {},
  run,
  signal: new AbortController().signal,
});

describe("TestServiceLease", () => {
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
      redisUrl: expect.stringMatching(/^redis:\/\/:[^@]+@127\.0\.0\.1:49153$/),
      spacyUrl: "http://127.0.0.1:49154",
    });
    const up = vi
      .mocked(run)
      .mock.calls.find(([, args]) => args.includes("up"));
    expect(up?.[2].env.CAT_E2E_LEASE_TOKEN).toBe(observed.ownership.token);
    expect(vi.mocked(run).mock.calls.at(-1)?.[1]).toEqual(
      expect.arrayContaining(["down", "--volumes", "--remove-orphans"]),
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
    expect(cleanup?.[2].env.CAT_E2E_LEASE_TOKEN).toEqual(expect.any(String));
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
    expect(cleanup?.[2].signal).not.toBe(controller.signal);
    expect(cleanup?.[2].env.CAT_E2E_LEASE_TOKEN).toEqual(expect.any(String));
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
        databaseUrl: "postgresql://user:pass@localhost:5432/cat",
        redisUrl: "redis://:pass@localhost:6379",
        spacyUrl: "https://localhost:8000",
      },
      ownership: { projectName: "cat-e2e-1", token: "token" },
      version: 1,
    });
    expect(parseTestServiceLease(valid).ownership.token).toBe("token");
    expect(() =>
      parseTestServiceLease(
        JSON.stringify({ ...JSON.parse(valid), extra: true }),
      ),
    ).toThrow("invalid root fields");
    expect(() =>
      parseTestServiceLease(valid.replace("postgresql:", "mysql:")),
    ).toThrow("databaseUrl must use");
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
