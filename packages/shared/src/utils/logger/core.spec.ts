import { describe, expect, it, vi } from "vitest";

import { Logger } from "./core.ts";
import type { DiagnosticEvent, DiagnosticTransport } from "./types.ts";

const captureTransport = (events: DiagnosticEvent[]): DiagnosticTransport => ({
  emit: (event) => {
    events.push(event);
  },
});

type UnhandledRejectionProcess = {
  on: (
    event: "unhandledRejection",
    listener: (reason: unknown, promise: Promise<unknown>) => void,
  ) => unknown;
  off: (
    event: "unhandledRejection",
    listener: (reason: unknown, promise: Promise<unknown>) => void,
  ) => unknown;
};

const isUnhandledRejectionProcess = (
  value: unknown,
): value is UnhandledRejectionProcess =>
  typeof value === "object" &&
  value !== null &&
  "on" in value &&
  typeof value.on === "function" &&
  "off" in value &&
  typeof value.off === "function";

describe("Logger", () => {
  it("creates immutable child context and emits one normalized event", () => {
    const events: DiagnosticEvent[] = [];
    const logger = new Logger({ runtime: "client" }, [
      captureTransport(events),
    ]);

    const pluginLogger = logger.child({ pluginId: "spacy" });
    pluginLogger.error("spaCy is unavailable", {
      code: "SPACY_UNAVAILABLE",
      error: new Error("connection refused"),
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      version: 1,
      level: "error",
      code: "SPACY_UNAVAILABLE",
      message: "spaCy is unavailable",
      context: { runtime: "client", pluginId: "spacy" },
      fields: {
        error: { name: "Error", message: "connection refused" },
      },
    });
    expect(logger.context).toEqual({ runtime: "client" });
    expect(Object.isFrozen(events[0]?.context)).toBe(true);
    expect(Object.isFrozen(events[0]?.fields)).toBe(true);
    expect(Object.isFrozen(events[0]?.fields.error)).toBe(true);
  });

  it("redacts sensitive fields before every recipient observes the event", () => {
    const events: DiagnosticEvent[] = [];
    const logger = new Logger({}, [captureTransport(events)]);

    logger.info("connected", {
      code: "CONNECTION_ESTABLISHED",
      token: "top-secret",
      nested: { authorization: "Bearer private", visible: "yes" },
    });

    expect(events[0]?.fields).toEqual({
      nested: { authorization: "[REDACTED]", visible: "yes" },
      token: "[REDACTED]",
    });
  });

  it("redacts secrets from event and Error messages without discarding safe diagnostics", () => {
    const events: DiagnosticEvent[] = [];
    const logger = new Logger({}, [captureTransport(events)]);

    logger.error("remote request failed: Authorization: Bearer top-secret", {
      code: "REMOTE_REQUEST_FAILED",
      error: Object.assign(
        new Error("upstream rejected token=top-secret for request 42"),
        { name: "RemoteRequestError" },
      ),
      requestId: "request-42",
    });

    expect(events[0]).toMatchObject({
      message: "remote request failed: Authorization: [REDACTED]",
      fields: {
        error: {
          name: "RemoteRequestError",
          message: "upstream rejected token=[REDACTED] for request 42",
        },
        requestId: "request-42",
      },
    });
    expect(JSON.stringify(events[0])).not.toContain("top-secret");
  });

  it("isolates failed transports and observers without changing application behavior", () => {
    const transportEvents: DiagnosticEvent[] = [];
    const observer = vi.fn();
    const logger = new Logger({}, [
      {
        emit: () => {
          throw new Error("console unavailable");
        },
      },
      captureTransport(transportEvents),
    ]);
    logger.observe(() => {
      throw new Error("observer unavailable");
    });
    logger.observe(observer);

    expect(() =>
      logger.warn("continuing", { code: "CONTINUING" }),
    ).not.toThrow();
    expect(transportEvents).toHaveLength(1);
    expect(observer).toHaveBeenCalledWith(transportEvents[0]);
  });

  it("contains asynchronous transport and observer failures without unhandled rejections", async () => {
    const runtimeProcess = Reflect.get(globalThis, "process");
    if (!isUnhandledRejectionProcess(runtimeProcess)) {
      throw new Error("Node unhandled rejection events are unavailable");
    }
    const unhandledRejection = vi.fn();
    runtimeProcess.on("unhandledRejection", unhandledRejection);
    const delivered: DiagnosticEvent[] = [];
    const logger = new Logger({}, [
      {
        emit: async () => {
          throw new Error("async transport unavailable");
        },
      },
      captureTransport(delivered),
    ]);
    logger.observe(async () => {
      throw new Error("async observer unavailable");
    });

    logger.info("still delivering", { code: "ASYNC_DELIVERY" });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    runtimeProcess.off("unhandledRejection", unhandledRejection);

    expect(delivered).toHaveLength(1);
    expect(unhandledRejection).not.toHaveBeenCalled();
  });

  it("only sends events to observers explicitly registered for the shared logger", () => {
    const logger = new Logger({ runtime: "server" });
    const observer = vi.fn();
    const stopObserving = logger.observe(observer);

    logger.child({ requestId: "first" }).info("first", { code: "REQUEST" });
    stopObserving();
    logger.info("second", { code: "REQUEST" });

    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { runtime: "server", requestId: "first" },
      }),
    );
  });
});
