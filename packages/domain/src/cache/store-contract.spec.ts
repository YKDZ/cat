import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryCacheStore } from "./memory-cache-store";
import { MemorySessionStore } from "./memory-session-store";

afterEach(() => {
  vi.useRealTimers();
});

describe("memory store contract", () => {
  it("supports cache get/set/delete/has while preserving null values", async () => {
    const store = new MemoryCacheStore("contract");

    await store.set("answer", { ok: true }, 60);
    expect(await store.has("answer")).toBe(true);
    expect(await store.get<{ ok: boolean }>("answer")).toEqual({ ok: true });

    await store.delete("answer");
    expect(await store.get("answer")).toBeNull();
    expect(await store.has("answer")).toBe(false);

    await store.set("nullable", null, 60);
    expect(await store.get("nullable")).toBeNull();
    expect(await store.has("nullable")).toBe(true);
  });

  it("expires cache entries by ttl", async () => {
    vi.useFakeTimers();

    const store = new MemoryCacheStore("ttl");
    await store.set("soon-expired", { ok: true }, 1);
    expect(await store.has("soon-expired")).toBe(true);

    vi.advanceTimersByTime(1_001);

    expect(await store.get("soon-expired")).toBeNull();
    expect(await store.has("soon-expired")).toBe(false);
  });

  it("stores session fields, expires them, and supports destroy", async () => {
    vi.useFakeTimers();

    const store = new MemorySessionStore();
    await store.create(
      "session-1",
      {
        userId: 123,
        provider: "password",
      },
      1,
    );

    expect(await store.getField("session-1", "userId")).toBe("123");
    expect(await store.getAll("session-1")).toEqual({
      userId: "123",
      provider: "password",
    });

    await store.create("session-2", { keep: "alive" }, 60);
    await store.destroy("session-2");
    expect(await store.getAll("session-2")).toBeNull();

    vi.advanceTimersByTime(1_001);
    expect(await store.getAll("session-1")).toBeNull();
  });
});
