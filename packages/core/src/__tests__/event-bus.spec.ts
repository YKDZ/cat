import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AnyEventOf, EventBus, EventHandler } from "../event-bus.ts";

import { InProcessEventBus, createEvent } from "../event-bus.ts";

// Minimal test event map — no external deps needed
type TestMap = {
  "foo:created": { id: string };
  "bar:updated": { count: number };
};

type TestEvent = AnyEventOf<TestMap>;
type TestBus = InProcessEventBus<keyof TestMap, TestEvent>;

const makeBus = (): TestBus =>
  new InProcessEventBus<keyof TestMap, TestEvent>();

const fooEvent = (id: string) =>
  createEvent<TestMap, "foo:created">("foo:created", { id });

const barEvent = (count: number) =>
  createEvent<TestMap, "bar:updated">("bar:updated", { count });

// ─── Type compatibility ───────────────────────────────────────────────────────

describe("type aliases", () => {
  it("EventBus type is assignable to InProcessEventBus", () => {
    const bus: EventBus<keyof TestMap, TestEvent> = makeBus();
    expect(bus).toBeTruthy();
  });

  it("EventHandler type is compatible", () => {
    const handler: EventHandler<TestEvent> = vi.fn();
    const bus = makeBus();
    bus.subscribeAll(handler);
    expect(bus).toBeTruthy();
  });
});

// ─── createEvent ─────────────────────────────────────────────────────────────

describe("createEvent", () => {
  it("should create an event with the correct type and payload", () => {
    const event = fooEvent("abc");
    expect(event.type).toBe("foo:created");
    expect(event.payload).toEqual({ id: "abc" });
  });

  it("should generate a non-empty eventId and timestamp by default", () => {
    const event = fooEvent("x");
    expect(event.eventId).toBeTruthy();
    expect(event.timestamp).toBeTruthy();
  });

  it("should use provided eventId and traceId options", () => {
    const event = createEvent<TestMap, "foo:created">(
      "foo:created",
      { id: "x" },
      { eventId: "fixed-id", traceId: "trace-1" },
    );
    expect(event.eventId).toBe("fixed-id");
    expect(event.traceId).toBe("trace-1");
  });

  it("should not include traceId or causationId when not provided", () => {
    const event = fooEvent("y");
    expect("traceId" in event).toBe(false);
    expect("causationId" in event).toBe(false);
  });

  it("should include causationId when provided", () => {
    const event = createEvent<TestMap, "foo:created">(
      "foo:created",
      { id: "z" },
      { causationId: "cause-1" },
    );
    expect(event.causationId).toBe("cause-1");
  });
});

// ─── InProcessEventBus ───────────────────────────────────────────────────────

describe("InProcessEventBus", () => {
  let bus: TestBus;

  beforeEach(() => {
    bus = makeBus();
  });

  describe("subscribe / publish", () => {
    it("should call handler when matching event type is published", async () => {
      const handler = vi.fn();
      bus.subscribe("foo:created", handler);
      const event = fooEvent("1");
      await bus.publish(event);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should not call handler for a non-matching event type", async () => {
      const handler = vi.fn();
      bus.subscribe("foo:created", handler);
      await bus.publish(barEvent(42));
      expect(handler).not.toHaveBeenCalled();
    });

    it("should support multiple handlers for the same type", async () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      bus.subscribe("foo:created", h1);
      bus.subscribe("foo:created", h2);
      const event = fooEvent("2");
      await bus.publish(event);
      expect(h1).toHaveBeenCalledWith(event);
      expect(h2).toHaveBeenCalledWith(event);
    });

    it("should stop calling a handler after unsubscribe", async () => {
      const handler = vi.fn();
      const unsubscribe = bus.subscribe("foo:created", handler);
      unsubscribe();
      await bus.publish(fooEvent("3"));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("subscribeAll", () => {
    it("should receive every published event regardless of type", async () => {
      const handler = vi.fn();
      bus.subscribeAll(handler);
      await bus.publish(fooEvent("a"));
      await bus.publish(barEvent(7));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should stop receiving events after unsubscribe", async () => {
      const handler = vi.fn();
      const unsub = bus.subscribeAll(handler);
      unsub();
      await bus.publish(fooEvent("b"));
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("publishMany", () => {
    it("should publish all events in order", async () => {
      const received: string[] = [];
      bus.subscribe("foo:created", (e) => {
        received.push(e.payload.id);
      });
      await bus.publishMany([fooEvent("first"), fooEvent("second")]);
      expect(received).toEqual(["first", "second"]);
    });
  });

  describe("waitFor", () => {
    it("should resolve when the expected event is published", async () => {
      const promise = bus.waitFor({ type: "foo:created", timeoutMs: 1000 });
      const event = fooEvent("w1");
      await bus.publish(event);
      const resolved = await promise;
      expect(resolved).toEqual(event);
    });

    it("should resolve only when predicate returns true", async () => {
      const promise = bus.waitFor({
        type: "foo:created",
        timeoutMs: 1000,
        predicate: (e) => e.payload.id === "target",
      });
      await bus.publish(fooEvent("other"));
      await bus.publish(fooEvent("target"));
      const resolved = await promise;
      expect(resolved.payload.id).toBe("target");
    });

    it("should reject when the timeout expires before the event is published", async () => {
      await expect(
        bus.waitFor({ type: "foo:created", timeoutMs: 10 }),
      ).rejects.toThrow(/timeout/i);
    });
  });
});
