import { Hono } from "hono";

export type ReadinessProbeCost = "cheap" | "expensive";

export type ReadinessProbeStatus = "ready" | "failed" | "degraded";

export type ReadinessComponent = {
  code: string;
  durationMs: number;
  required: boolean;
  status: ReadinessProbeStatus;
};

export type ReadinessReport = {
  components: Record<string, ReadinessComponent>;
  profile: string | null;
  runtime?: ReadinessRuntimeSummary;
  status: "ready" | "degraded" | "not-ready";
};

/** Runtime policy exposed with readiness so external orchestrators can attest it. */
export type ReadinessRuntimeSummary = {
  cacheBackend: string;
  queueBackend: string;
  sessionBackend: string;
};

export type ReadinessProbe = {
  cost: ReadinessProbeCost;
  id: string;
  required: boolean;
  run: (signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
};

export type ReadinessReporterOptions = {
  cacheTtlMs?: Record<ReadinessProbeCost, number>;
  globalDeadlineMs?: number;
  profile: string;
  probes: ReadinessProbe[];
  runtime?: ReadinessRuntimeSummary;
};

type CachedComponent = {
  component: ReadinessComponent;
  expiresAt: number;
};

type ActiveProbe = {
  promise: Promise<void>;
};

const DEFAULT_CACHE_TTL_MS: Record<ReadinessProbeCost, number> = {
  cheap: 250,
  expensive: 1_000,
};

const DEFAULT_TIMEOUT_MS: Record<ReadinessProbeCost, number> = {
  cheap: 500,
  expensive: 2_000,
};

const DEFAULT_GLOBAL_DEADLINE_MS = 3_000;

export class ReadinessProbeFailure extends Error {
  public readonly code: string;

  public constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const waitForAbort = (
  signal: AbortSignal,
): { cleanup: () => void; promise: Promise<never> } => {
  let removeListener = (): void => {};
  const promise = new Promise<never>((_, reject) => {
    const abort = (): void => {
      reject(signal.reason ?? new ReadinessProbeFailure("CHECK_FAILED"));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    removeListener = (): void => signal.removeEventListener("abort", abort);
  });
  return { cleanup: removeListener, promise };
};

const errorCode = (error: unknown): string =>
  error instanceof ReadinessProbeFailure ? error.code : "CHECK_FAILED";

const runProbe = async (
  probe: ReadinessProbe,
  deadline: AbortSignal,
  activeProbes: Map<string, ActiveProbe>,
): Promise<ReadinessComponent> => {
  const startedAt = performance.now();
  if (activeProbes.has(probe.id)) {
    return {
      code: "CHECK_IN_PROGRESS",
      durationMs: 0,
      required: probe.required,
      status: probe.required ? "failed" : "degraded",
    };
  }
  const timeout = new AbortController();
  const timeoutId = setTimeout(() => {
    timeout.abort(new ReadinessProbeFailure("TIMEOUT"));
  }, probe.timeoutMs ?? DEFAULT_TIMEOUT_MS[probe.cost]);
  const signal = AbortSignal.any([deadline, timeout.signal]);
  const abort = waitForAbort(signal);

  const probePromise = probe.run(signal);
  const active: ActiveProbe = { promise: probePromise };
  activeProbes.set(probe.id, active);
  void probePromise.then(
    () => {
      if (activeProbes.get(probe.id) === active) {
        activeProbes.delete(probe.id);
      }
    },
    () => {
      if (activeProbes.get(probe.id) === active) {
        activeProbes.delete(probe.id);
      }
    },
  );

  try {
    await Promise.race([probePromise, abort.promise]);
    return {
      code: "OK",
      durationMs: Math.round(performance.now() - startedAt),
      required: probe.required,
      status: "ready",
    };
  } catch (error) {
    return {
      code: errorCode(error),
      durationMs: Math.round(performance.now() - startedAt),
      required: probe.required,
      status: probe.required ? "failed" : "degraded",
    };
  } finally {
    abort.cleanup();
    clearTimeout(timeoutId);
  }
};

export type ReadinessReporter = {
  report: () => Promise<ReadinessReport>;
};

/**
 * Create the bounded dependency aggregate used by the HTTP readiness endpoint.
 * Individual results are cached by probe cost so expensive network checks do not
 * run for every request, while a short TTL still permits dependency recovery.
 */
export const createReadinessReporter = (
  options: ReadinessReporterOptions,
): ReadinessReporter => {
  const cacheTtlMs = { ...DEFAULT_CACHE_TTL_MS, ...options.cacheTtlMs };
  const cache = new Map<string, CachedComponent>();
  const activeProbes = new Map<string, ActiveProbe>();
  let inFlight: Promise<ReadinessReport> | undefined;

  const report = async (): Promise<ReadinessReport> => {
    if (inFlight) return inFlight;

    const deadline = new AbortController();
    const deadlineId = setTimeout(() => {
      deadline.abort(new ReadinessProbeFailure("DEADLINE_EXCEEDED"));
    }, options.globalDeadlineMs ?? DEFAULT_GLOBAL_DEADLINE_MS);
    const now = Date.now();
    const pending = (async (): Promise<ReadinessReport> => {
      try {
        const entries = await Promise.all(
          options.probes.map(async (probe) => {
            const cached = cache.get(probe.id);
            const component =
              cached && cached.expiresAt > now
                ? cached.component
                : await runProbe(probe, deadline.signal, activeProbes);
            if (!cached || cached.expiresAt <= now) {
              cache.set(probe.id, {
                component,
                expiresAt: Date.now() + cacheTtlMs[probe.cost],
              });
            }
            return [probe.id, component] as const;
          }),
        );
        const components = Object.fromEntries(entries);
        const requiredFailure = Object.values(components).some(
          (component) => component.required && component.status === "failed",
        );
        const degraded = Object.values(components).some(
          (component) => component.status === "degraded",
        );
        return {
          components,
          profile: options.profile,
          ...(options.runtime === undefined
            ? {}
            : { runtime: options.runtime }),
          status: requiredFailure
            ? "not-ready"
            : degraded
              ? "degraded"
              : "ready",
        };
      } finally {
        clearTimeout(deadlineId);
      }
    })();
    inFlight = pending;
    void pending.then(
      // oxlint-disable-next-line promise/always-return
      () => {
        if (inFlight === pending) inFlight = undefined;
      },
      () => {
        if (inFlight === pending) inFlight = undefined;
      },
    );
    return pending;
  };

  return { report };
};

const reporterProcessKey = "__CAT_READINESS_REPORTER__";

let reporter: ReadinessReporter | undefined;

const processReporter = (): ReadinessReporter | undefined => {
  const value = Reflect.get(process, reporterProcessKey);
  return value !== undefined && typeof value === "object" && value !== null
    ? (value as ReadinessReporter)
    : undefined;
};

export const configureReadinessReporter = (
  nextReporter: ReadinessReporter | undefined,
): void => {
  reporter = nextReporter;
  if (nextReporter === undefined) {
    Reflect.deleteProperty(process, reporterProcessKey);
  } else {
    Reflect.set(process, reporterProcessKey, nextReporter);
  }
};

const uninitializedReport = (): ReadinessReport => ({
  components: {
    runtime: {
      code: "RUNTIME_UNINITIALIZED",
      durationMs: 0,
      required: true,
      status: "failed",
    },
  },
  profile: null,
  status: "not-ready",
});

export const livenessHandler = new Hono().get("/", (c) =>
  c.json({ status: "live" }),
);

export const readinessHandler = new Hono().get("/", async (c) => {
  const activeReporter = reporter ?? processReporter();
  const report = activeReporter
    ? await activeReporter.report()
    : uninitializedReport();
  return c.json(report, report.status === "not-ready" ? 503 : 200);
});
