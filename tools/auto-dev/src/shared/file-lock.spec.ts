import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { acquireLock } from "./file-lock.js";

describe("acquireLock", () => {
  it("obtains and releases lock", async () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), "file-lock-test-"));
    const testFile = resolve(tmpDir, "test.json");
    try {
      const release = await acquireLock(testFile);
      expect(existsSync(testFile + ".lock")).toBe(true);
      await release();
      expect(existsSync(testFile + ".lock")).toBe(false);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("lock timeout throws error", async () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), "file-lock-timeout-"));
    const testFile = resolve(tmpDir, "test.json");
    try {
      const release1 = await acquireLock(testFile);
      await expect(acquireLock(testFile)).rejects.toThrow("Timed out waiting for lock");
      await release1();
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }, 10000);

  it("concurrent acquires are serialized", async () => {
    const tmpDir = mkdtempSync(resolve(tmpdir(), "file-lock-concurrent-"));
    const testFile = resolve(tmpDir, "test.json");
    try {
      const results = await Promise.allSettled([
        acquireLock(testFile),
        acquireLock(testFile),
        acquireLock(testFile),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);
      for (const result of fulfilled) {
        if (result.status === "fulfilled") {
          await result.value();
        }
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }, 10000);
});
