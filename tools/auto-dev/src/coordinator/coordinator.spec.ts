import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../shared/gh-cli.js", () => ({
  listIssues: vi.fn().mockReturnValue([]),
}));

vi.mock("../config/loader.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    agents: {},
    defaultAgent: "full-pipeline",
    pollIntervalSec: 3600,
    maxDecisionPerRun: 20,
    maxImplCycles: 5,
  }),
}));

import { Coordinator } from "./coordinator.js";
import { ensureStateDirs } from "../state-store/index.js";

let tmpDir: string;
let oldSocketPath: string | undefined;

beforeEach(async () => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "coord-test-"));
  oldSocketPath = process.env.AUTO_DEV_SOCKET;
  process.env.AUTO_DEV_SOCKET = resolve(tmpDir, "test.sock");
  await ensureStateDirs(tmpDir);
});

afterEach(async () => {
  if (oldSocketPath) {
    process.env.AUTO_DEV_SOCKET = oldSocketPath;
  } else {
    delete process.env.AUTO_DEV_SOCKET;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

describe("Coordinator", () => {
  it("can be instantiated", () => {
    const coordinator = new Coordinator(tmpDir, "owner/repo");
    expect(coordinator).toBeInstanceOf(Coordinator);
  });

  it("start initializes and sets polling", async () => {
    const coordinator = new Coordinator(tmpDir, "owner/repo");
    const startPromise = coordinator.start();
    await new Promise((r) => setTimeout(r, 100));
    await coordinator.stop();
    await expect(startPromise).resolves.toBeUndefined();
  }, 10000);

  it("stop can be called without start", async () => {
    const coordinator = new Coordinator(tmpDir, "owner/repo");
    await expect(coordinator.stop()).resolves.toBeUndefined();
  });
});
