import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { AuditLogger } from "./audit-logger.js";
import type { AuditEvent } from "../shared/types.js";

let tmpDir: string;
let logger: AuditLogger;

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "audit-"));
  logger = new AuditLogger(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("AuditLogger", () => {
  it("logs and reads events", () => {
    const event: AuditEvent = {
      id: "evt-1", workflowRunId: "run-1",
      timestamp: new Date().toISOString(),
      type: "decision_requested",
      payload: { decisionId: "dec-1" },
    };
    logger.log(event);
    const events = logger.read("run-1");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("decision_requested");
  });

  it("returns empty array for missing run", () => {
    const events = logger.read("nonexistent");
    expect(events).toEqual([]);
  });
});
