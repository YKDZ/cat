import { describe, expect, it, vi } from "vitest";

import {
  ExpectedRequestCancellationError,
  expectedRequestCancellation,
  isExpectedNavigationCancellation,
  isExpectedRequestCancellationFor,
  RequestCancellationRegistry,
  requestIdHeader,
} from "./request-cancellation.ts";

describe("RPC request cancellation registry", () => {
  it("tracks only active requests and removes expected cancellation state when settled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T08:00:00.000Z"));
    const registry = new RequestCancellationRegistry();
    registry.register("active-1", "https://cat.test/api/rpc/one");
    registry.register("active-2", "https://cat.test/api/rpc/two");

    expect(registry.activeRequestIds()).toEqual(["active-1", "active-2"]);
    expect(registry.cancelActive("navigation")).toEqual([
      {
        expected: true,
        id: "active-1",
        kind: "navigation",
        time: Date.now(),
        url: "https://cat.test/api/rpc/one",
        version: 1,
      },
      {
        expected: true,
        id: "active-2",
        kind: "navigation",
        time: Date.now(),
        url: "https://cat.test/api/rpc/two",
        version: 1,
      },
    ]);

    registry.settle("active-1");
    expect(registry.activeRequestIds()).toEqual(["active-2"]);
    expect(registry.expected("active-1")).toBeUndefined();
    registry.settle("active-2");
    expect(registry.cancelActive("navigation")).toEqual([]);
    vi.useRealTimers();
  });

  it("marks signal cancellations as expected and matches errors only to their request ID", () => {
    const registry = new RequestCancellationRegistry();
    registry.register("signal-1", "https://cat.test/api/rpc/suggest");
    const cancellation = registry.cancel("signal-1", "signal");
    if (cancellation === undefined)
      throw new Error("Expected active cancellation");
    const error = new ExpectedRequestCancellationError(cancellation);

    expect(expectedRequestCancellation(error)).toBe(cancellation);
    expect(
      isExpectedRequestCancellationFor(
        error,
        new Request("https://cat.test/api/rpc/suggest", {
          headers: { [requestIdHeader]: "signal-1" },
        }),
      ),
    ).toBe(true);
    expect(
      isExpectedRequestCancellationFor(
        error,
        new Request("https://cat.test/api/rpc/suggest", {
          headers: { [requestIdHeader]: "other-request" },
        }),
      ),
    ).toBe(false);

    const wrapped = new Error("Cannot parse response body", { cause: error });
    expect(expectedRequestCancellation(wrapped)).toBe(cancellation);
    expect(
      isExpectedRequestCancellationFor(
        wrapped,
        new Request("https://cat.test/api/rpc/suggest", {
          headers: { [requestIdHeader]: "signal-1" },
        }),
      ),
    ).toBe(true);
    expect(
      isExpectedRequestCancellationFor(
        wrapped,
        new Request("https://cat.test/api/rpc/suggest", {
          headers: { [requestIdHeader]: "other-request" },
        }),
      ),
    ).toBe(false);
  });

  it("recognizes only a direct branded navigation cancellation for UI recovery", () => {
    const navigation = new ExpectedRequestCancellationError({
      expected: true,
      id: "navigation-1",
      kind: "navigation",
      time: 1,
      url: "https://cat.test/api/rpc/translation/onCreate",
      version: 1,
    });
    const signal = new ExpectedRequestCancellationError({
      expected: true,
      id: "signal-1",
      kind: "signal",
      time: 1,
      url: "https://cat.test/api/rpc/translation/onCreate",
      version: 1,
    });

    expect(isExpectedNavigationCancellation(navigation)).toBe(true);
    expect(isExpectedNavigationCancellation(signal)).toBe(false);
    expect(
      isExpectedNavigationCancellation(
        new Error("CAT request was cancelled", { cause: navigation }),
      ),
    ).toBe(false);
    expect(
      isExpectedNavigationCancellation(new Error("ordinary failure")),
    ).toBe(false);
  });

  it("does not accept a navigation cancellation forged through the former public symbol", () => {
    const cancellation = {
      expected: true as const,
      id: "forged-navigation",
      kind: "navigation" as const,
      time: 1,
      url: "https://cat.test/api/rpc/translation/onCreate",
      version: 1 as const,
    };
    const forged = new Error("CAT request was cancelled");
    forged.name = "ExpectedRequestCancellationError";
    Reflect.set(
      forged,
      Symbol.for("cat.orpc.expected-request-cancellation"),
      cancellation,
    );

    expect(expectedRequestCancellation(forged)).toBeUndefined();
    expect(isExpectedNavigationCancellation(forged)).toBe(false);
  });
});
