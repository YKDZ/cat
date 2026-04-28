import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { ValidationGate } from "./validation-gate.js";

let tmpDir: string;
let gate: ValidationGate;

const setupGitRepo = () => {
  execSync("git init", { cwd: tmpDir, stdio: "ignore" });
  execSync("git config user.email test@test.com", { cwd: tmpDir, stdio: "ignore" });
  execSync("git config user.name Test", { cwd: tmpDir, stdio: "ignore" });
  writeFileSync(resolve(tmpDir, "README.md"), "# Test");
  execSync("git add -A", { cwd: tmpDir, stdio: "ignore" });
  execSync("git commit -m init", { cwd: tmpDir, stdio: "ignore" });
};

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "val-test-"));
  setupGitRepo();
  gate = new ValidationGate(tmpDir, "owner/repo");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("ValidationGate", () => {
  it("all checks pass on clean repo", () => {
    const result = gate.validate(tmpDir, null);
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(2);
  });

  it("git dirty state detected", () => {
    writeFileSync(resolve(tmpDir, "dirty.txt"), "content");
    const result = gate.validate(tmpDir, null);
    expect(result.passed).toBe(false);
    expect(result.checks[0].passed).toBe(false);
  });

  it("all checks listed even when some fail", () => {
    writeFileSync(resolve(tmpDir, "dirty.txt"), "content");
    const result = gate.validate(tmpDir, null);
    expect(result.checks.length).toBeGreaterThanOrEqual(2);
  });
});
