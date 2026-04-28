import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { DocSync } from "./doc-sync.js";

let tmpDir: string;
let sync: DocSync;

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "doc-sync-"));
  sync = new DocSync(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("DocSync", () => {
  it("ensureNamespace creates directory", () => {
    const ns = sync.ensureNamespace(42);
    expect(ns).toBe("auto-dev-42");
    expect(existsSync(resolve(tmpDir, "todo", "auto-dev-42"))).toBe(true);
  });

  it("syncFromIssue creates issue file", async () => {
    const ns = await sync.syncFromIssue(1, "Issue body content");
    expect(ns).toBe("auto-dev-1");
    expect(existsSync(resolve(tmpDir, "todo", "auto-dev-1", "issue.md"))).toBe(true);
  });
});
