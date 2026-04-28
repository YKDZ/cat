import { randomUUID } from "node:crypto";
import { mkdtempSync, existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { DecisionRequest, DecisionResponse } from "../shared/types.js";

import { DEFAULT_CONFIG } from "../config/types.js";
import { DecisionSocketServer } from "./socket-server.js";

let tmpDir: string;
let socketPath: string;
let server: DecisionSocketServer;

const noopAccept = vi
  .fn()
  .mockResolvedValue({ accepted: true, remainingDecisions: 19 });
const noopGetResolution = vi.fn().mockResolvedValue(null);

beforeEach(async () => {
  tmpDir = mkdtempSync(resolve(tmpdir(), "socket-test-"));
  socketPath = resolve(tmpDir, "auto-dev.sock");
  server = new DecisionSocketServer({
    socketPath,
    config: DEFAULT_CONFIG,
    workspaceRoot: tmpDir,
    onDecisionRequest: noopAccept,
    onGetResolution: noopGetResolution,
  });
});

afterEach(async () => {
  await server.stop();
  await rm(tmpDir, { recursive: true, force: true });
});

const makeRequest = (): DecisionRequest => ({
  id: randomUUID(),
  workflowRunId: "test-run-id",
  title: "Test decision",
  options: [{ key: "a", label: "Option A", description: "First option" }],
  recommendation: "a",
  context: null,
});

describe("DecisionSocketServer", () => {
  it("starts and listens on socket path", async () => {
    await server.start();
    expect(existsSync(socketPath)).toBe(true);
  });

  it("client connects and sends decision request", async () => {
    await server.start();
    const request = makeRequest();

    const result = await new Promise<string>((resolvePromise, reject) => {
      const socket = createConnection(socketPath, () => {
        socket.write(JSON.stringify(request) + "\n");
      });

      socket.on("data", (data: Buffer) => {
        resolvePromise(data.toString("utf-8"));
        socket.end();
      });

      socket.on("error", reject);

      setTimeout(() => {
        resolvePromise("connected");
        socket.end();
      }, 500);
    });

    expect(result).toBe("connected");
  });

  it("keeps connection open after receiving request", async () => {
    await server.start();
    const request = makeRequest();

    await new Promise<void>((resolvePromise, reject) => {
      const socket = createConnection(socketPath, () => {
        socket.write(JSON.stringify(request) + "\n");
      });

      setTimeout(() => {
        expect(socket.readyState).toBe("open");
        socket.end();
        resolvePromise();
      }, 100);

      socket.on("error", reject);
    });
  });

  it("responds to client after resolveDecision", async () => {
    await server.start();
    const request = makeRequest();

    const responsePromise = new Promise<string>((resolvePromise, reject) => {
      const socket = createConnection(socketPath, () => {
        socket.write(JSON.stringify(request) + "\n");
      });

      socket.on("data", (data: Buffer) => {
        resolvePromise(data.toString("utf-8").trim());
        socket.end();
      });

      socket.on("error", reject);
    });

    await new Promise((r) => setTimeout(r, 200));

    const response: DecisionResponse = {
      decisionId: request.id,
      title: request.title,
      resolution: "a",
      resolvedBy: "human",
      resolvedAt: new Date().toISOString(),
      remainingDecisions: 18,
    };

    server.resolveDecision(request.id, response);

    const result = await responsePromise;
    const parsed = JSON.parse(result);
    expect(parsed.decisionId).toBe(request.id);
    expect(parsed.resolution).toBe("a");
  }, 10000);

  it("rejects when onDecisionRequest returns false", async () => {
    const rejectServer = new DecisionSocketServer({
      socketPath: resolve(tmpDir, "reject.sock"),
      config: DEFAULT_CONFIG,
      workspaceRoot: tmpDir,
      onDecisionRequest: vi
        .fn()
        .mockResolvedValue({ accepted: false, remainingDecisions: 0 }),
      onGetResolution: noopGetResolution,
    });

    await rejectServer.start();
    const request = makeRequest();

    const result = await new Promise<string>((resolvePromise, reject) => {
      const socket = createConnection(resolve(tmpDir, "reject.sock"), () => {
        socket.write(JSON.stringify(request) + "\n");
      });

      socket.on("data", (data: Buffer) => {
        resolvePromise(data.toString("utf-8").trim());
        socket.end();
      });

      socket.on("error", reject);
    });

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("Decision limit reached");
    expect(parsed.remainingDecisions).toBe(0);

    await rejectServer.stop();
  });

  it("handles invalid JSON", async () => {
    await server.start();

    const result = await new Promise<string>((resolvePromise, reject) => {
      const socket = createConnection(socketPath, () => {
        socket.write("not valid json\n");
      });

      socket.on("data", (data: Buffer) => {
        resolvePromise(data.toString("utf-8").trim());
        socket.end();
      });

      socket.on("error", reject);
    });

    const parsed = JSON.parse(result);
    expect(parsed.error).toBe("Invalid JSON in decision request");
  });

  it("cleans up on stop", async () => {
    await server.start();
    await server.stop();
    expect(existsSync(socketPath)).toBe(false);
  });
});
