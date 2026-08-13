import { afterEach, describe, expect, it, vi } from "vitest";

import app from "../app.ts";
import {
  ReadinessProbeFailure,
  configureReadinessReporter,
  createReadinessReporter,
} from "./readiness.ts";

const wait = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

afterEach(() => {
  configureReadinessReporter(undefined);
  Reflect.deleteProperty(globalThis, "inited");
  Reflect.deleteProperty(process, "__CAT_INITIALIZED__");
});

describe("readiness reporter", () => {
  it("serves the aggregate at /_health/ready and removes legacy health endpoints", async () => {
    configureReadinessReporter(
      createReadinessReporter({
        profile: "lite",
        probes: [
          {
            cost: "cheap",
            id: "bootstrap",
            required: true,
            run: async () => {},
          },
        ],
      }),
    );
    Reflect.set(globalThis, "inited", true);

    const ready = await app.request("http://localhost/_health/ready");
    const legacy = await app.request("http://localhost/_health");
    const legacyReady = await app.request("http://localhost/_ready");

    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toMatchObject({ status: "ready" });
    expect(legacy.status).toBe(404);
    expect(legacyReady.status).toBe(404);
  });

  it("runs required probes in parallel and returns structured non-sensitive failures", async () => {
    const started: string[] = [];
    const reporter = createReadinessReporter({
      globalDeadlineMs: 100,
      profile: "lite",
      probes: [
        {
          cost: "cheap",
          id: "bootstrap",
          required: true,
          run: async () => {
            started.push("bootstrap");
            await wait(20);
          },
        },
        {
          cost: "expensive",
          id: "storage",
          required: true,
          run: async () => {
            started.push("storage");
            throw new Error("postgres://operator:secret@example.test/cat");
          },
        },
      ],
    });

    const report = await reporter.report();

    expect(started).toEqual(expect.arrayContaining(["bootstrap", "storage"]));
    expect(report).toMatchObject({ profile: "lite", status: "not-ready" });
    expect(report.components.storage).toMatchObject({
      code: "CHECK_FAILED",
      required: true,
      status: "failed",
    });
    expect(JSON.stringify(report)).not.toContain("secret");
    expect(report.components.bootstrap).toMatchObject({
      durationMs: expect.any(Number),
    });
  });

  it("returns degraded without failing readiness when only optional probes fail", async () => {
    const reporter = createReadinessReporter({
      profile: "lite",
      probes: [
        { cost: "cheap", id: "bootstrap", required: true, run: async () => {} },
        {
          cost: "expensive",
          id: "optional-advisor",
          required: false,
          run: async () => {
            throw new ReadinessProbeFailure("REMOTE_UNAVAILABLE");
          },
        },
      ],
    });

    await expect(reporter.report()).resolves.toMatchObject({
      status: "degraded",
      components: {
        "optional-advisor": {
          code: "REMOTE_UNAVAILABLE",
          status: "degraded",
        },
      },
    });
  });

  it("applies a global deadline and a per-probe timeout", async () => {
    const reporter = createReadinessReporter({
      globalDeadlineMs: 20,
      profile: "production",
      probes: [
        {
          cost: "expensive",
          id: "postgres",
          required: true,
          run: async () => {
            await wait(100);
          },
        },
        {
          cost: "cheap",
          id: "redis",
          required: true,
          timeoutMs: 10,
          run: async () => {
            await wait(100);
          },
        },
      ],
    });

    const report = await reporter.report();

    expect(report.components.postgres).toMatchObject({
      code: "DEADLINE_EXCEEDED",
    });
    expect(report.components.redis).toMatchObject({ code: "TIMEOUT" });
  });

  it("does not start another non-cancellable probe after its timed-out run is still active", async () => {
    const probe = vi.fn(async () => new Promise<void>(() => {}));
    const reporter = createReadinessReporter({
      cacheTtlMs: { cheap: 1, expensive: 1 },
      globalDeadlineMs: 10,
      profile: "production",
      probes: [
        { cost: "cheap", id: "bootstrap", required: true, run: async () => {} },
        { cost: "expensive", id: "spacy", required: true, run: probe },
      ],
    });

    await expect(reporter.report()).resolves.toMatchObject({
      components: { spacy: { code: "DEADLINE_EXCEEDED" } },
    });
    await wait(5);
    await expect(reporter.report()).resolves.toMatchObject({
      components: { spacy: { code: "CHECK_IN_PROGRESS" } },
    });
    expect(probe).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent reports and rechecks a recovered dependency after its cost TTL", async () => {
    let available = false;
    const probe = vi.fn(async () => {
      if (!available) throw new ReadinessProbeFailure("REMOTE_UNAVAILABLE");
    });
    const reporter = createReadinessReporter({
      cacheTtlMs: { cheap: 1, expensive: 20 },
      profile: "production",
      probes: [
        { cost: "cheap", id: "bootstrap", required: true, run: async () => {} },
        { cost: "expensive", id: "redis", required: true, run: probe },
      ],
    });

    const [first, second] = await Promise.all([
      reporter.report(),
      reporter.report(),
    ]);
    expect(first.status).toBe("not-ready");
    expect(second.status).toBe("not-ready");
    expect(probe).toHaveBeenCalledTimes(1);

    available = true;
    await wait(25);

    await expect(reporter.report()).resolves.toMatchObject({ status: "ready" });
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
