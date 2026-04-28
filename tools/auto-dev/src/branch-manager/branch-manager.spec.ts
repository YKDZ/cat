import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { BranchManager } from "./branch-manager.js";

let tmpDir: string;
let manager: BranchManager;

const setupGitRepo = () => {
  execSync("git init -b main", { cwd: tmpDir, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: tmpDir, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: tmpDir, stdio: "ignore" });
  writeFileSync(resolve(tmpDir, "README.md"), "# Test");
  execSync("git add -A", { cwd: tmpDir, stdio: "ignore" });
  execSync("git commit -m init", { cwd: tmpDir, stdio: "ignore" });
};

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "branch-test-"));
  setupGitRepo();
  manager = new BranchManager(tmpDir, "owner/repo");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("BranchManager", () => {
  it("isClean returns true on fresh branch", () => {
    expect(manager.isClean()).toBe(true);
  });

  it("isClean returns false after file modifications", () => {
    writeFileSync(resolve(tmpDir, "new-file.txt"), "content");
    expect(manager.isClean()).toBe(false);
  });

  it("hasConflicts returns false on clean state", () => {
    expect(manager.hasConflicts()).toBe(false);
  });
});
