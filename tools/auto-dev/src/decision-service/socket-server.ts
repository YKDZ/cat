import type { Socket, Server } from "node:net";

import { unlinkSync, existsSync } from "node:fs";
import { createServer } from "node:net";

import type { AutoDevConfig } from "../config/types.js";
import type { DecisionRequest, DecisionResponse } from "../shared/types.js";

import { DecisionRequestSchema } from "../shared/schemas.js";

interface PendingConnection {
  socket: Socket;
  request: DecisionRequest;
  buffer: string;
}

export interface SocketServerOptions {
  socketPath: string;
  config: AutoDevConfig;
  workspaceRoot: string;
  onDecisionRequest: (request: DecisionRequest) => Promise<{
    accepted: boolean;
    remainingDecisions: number;
  }>;
  onGetResolution: (decisionId: string) => Promise<DecisionResponse | null>;
}

export class DecisionSocketServer {
  private server: Server | null = null;
  private pending: Map<string, PendingConnection> = new Map();
  private readonly options: SocketServerOptions;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly POLL_INTERVAL_MS = 2000;

  constructor(options: SocketServerOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (existsSync(this.options.socketPath)) {
        try {
          unlinkSync(this.options.socketPath);
        } catch {
          // Stale socket cleanup failed
        }
      }

      this.server = createServer((socket: Socket) => {
        this.handleConnection(socket);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        console.error(
          `[auto-dev] Decision socket server error: ${err.message}`,
        );
        reject(err);
      });

      this.server.listen(this.options.socketPath, () => {
        console.log(
          `[auto-dev] Decision socket listening on ${this.options.socketPath}`,
        );
        this.startResolutionPoller();
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }

      for (const [, pending] of this.pending) {
        pending.socket.destroy();
      }
      this.pending.clear();

      if (this.server) {
        this.server.close(() => {
          if (existsSync(this.options.socketPath)) {
            try {
              unlinkSync(this.options.socketPath);
            } catch {
              /* ignore */
            }
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Polls pending decisions against the state store so that when a human
   * resolves a decision via `auto-dev resolve-decision` (which only writes to
   * the file system), the blocked `request-decision` socket connection is
   * automatically woken up and the agent resumes.
   */
  private startResolutionPoller(): void {
    const poll = async () => {
      await Promise.all(
        [...this.pending.keys()].map(async (decisionId) => {
          try {
            const response = await this.options.onGetResolution(decisionId);
            if (response) {
              this.resolveDecision(decisionId, response);
            }
          } catch (err) {
            console.error(
              `[auto-dev] Resolution poller error for decision ${decisionId}: ${String(err)}`,
            );
          }
        }),
      );
      this.pollTimer = setTimeout(
        () => void poll(),
        DecisionSocketServer.POLL_INTERVAL_MS,
      );
    };
    this.pollTimer = setTimeout(
      () => void poll(),
      DecisionSocketServer.POLL_INTERVAL_MS,
    );
  }

  resolveDecision(decisionId: string, response: DecisionResponse): void {
    const pending = this.pending.get(decisionId);
    if (!pending) {
      console.warn(
        `[auto-dev] No pending connection for decision ${decisionId}`,
      );
      return;
    }

    const payload = JSON.stringify(response) + "\n";
    pending.socket.write(payload, () => {
      pending.socket.end();
      this.pending.delete(decisionId);
    });
  }

  private cleanupConnection(decisionId: string): void {
    this.pending.delete(decisionId);
  }

  private handleConnection(socket: Socket): void {
    let buffer = "";
    let decisionId: string | null = null;

    socket.on("data", (data: Buffer) => {
      void this.handleData(socket, data, buffer, decisionId)
        .then((updated) => {
          buffer = updated.buffer;
          decisionId = updated.decisionId;
        })
        .catch((err: unknown) => {
          console.error(`[auto-dev] Connection handler error: ${String(err)}`);
          socket.destroy();
        });
    });

    socket.on("error", (err: Error) => {
      console.error(`[auto-dev] Socket error: ${err.message}`);
      if (decisionId) {
        this.cleanupConnection(decisionId);
      }
    });
  }

  private async handleData(
    socket: Socket,
    data: Buffer,
    currentBuffer: string,
    currentDecisionId: string | null,
  ): Promise<{ buffer: string; decisionId: string | null }> {
    let buffer = currentBuffer + data.toString("utf-8");
    let decisionId = currentDecisionId;

    const newlineIdx = buffer.indexOf("\n");
    if (newlineIdx === -1) return { buffer, decisionId };

    const message = buffer.slice(0, newlineIdx);
    buffer = buffer.slice(newlineIdx + 1);

    let request: DecisionRequest;
    try {
      request = DecisionRequestSchema.parse(JSON.parse(message));
    } catch {
      const errorResp =
        JSON.stringify({
          error: "Invalid JSON in decision request",
        }) + "\n";
      socket.write(errorResp);
      socket.end();
      return { buffer, decisionId };
    }

    decisionId = request.id;

    const result = await this.options.onDecisionRequest(request);

    if (!result.accepted) {
      const errorResp =
        JSON.stringify({
          error: "Decision limit reached",
          remainingDecisions: 0,
        }) + "\n";
      socket.write(errorResp);
      socket.end();
      return { buffer, decisionId };
    }

    this.pending.set(request.id, {
      socket,
      request,
      buffer,
    });

    socket.on("close", () => {
      if (decisionId) {
        this.cleanupConnection(decisionId);
      }
    });

    socket.on("error", () => {
      if (decisionId) {
        this.cleanupConnection(decisionId);
      }
    });

    return { buffer, decisionId };
  }
}
