import { execSync } from "node:child_process";
import { describe, it, expect } from "vitest";

describe("CLI", () => {
  it("no subcommand prints usage", () => {
    try {
      execSync("node tools/auto-dev/dist/cli.js", {
        encoding: "utf-8",
        cwd: "/workspaces/cat",
      });
    } catch (err: unknown) {
      expect((err as { stderr: string }).stderr).toContain("Usage:");
      expect((err as { stderr: string }).stderr).toContain("start");
      expect((err as { stderr: string }).stderr).toContain("status");
      expect((err as { stderr: string }).stderr).toContain("list");
      expect((err as { stderr: string }).stderr).toContain("config");
      expect((err as { stderr: string }).stderr).toContain("request-decision");
      expect((err as { stderr: string }).stderr).toContain("resolve-decision");
    }
  });

  it("unknown subcommand exits 1", () => {
    try {
      execSync("node tools/auto-dev/dist/cli.js nonexistent", {
        encoding: "utf-8",
        cwd: "/workspaces/cat",
      });
    } catch (err: unknown) {
      expect((err as { status: number }).status).toBe(1);
      expect((err as { stderr: string }).stderr).toContain("Usage:");
    }
  });

  it("config command outputs current config", () => {
    const output = execSync("node tools/auto-dev/dist/cli.js config", {
      encoding: "utf-8",
      cwd: "/workspaces/cat",
    });
    const config = JSON.parse(output);
    expect(config.defaultAgent).toBe("full-pipeline");
    expect(config.pollIntervalSec).toBe(30);
  });

  it("status command returns JSON", () => {
    const output = execSync("node tools/auto-dev/dist/cli.js status", {
      encoding: "utf-8",
      cwd: "/workspaces/cat",
    });
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
