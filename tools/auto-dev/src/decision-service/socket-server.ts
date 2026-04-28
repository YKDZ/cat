import type { Socket, Server } from "node:net";

import { unlinkSync, existsSync } from "node:fs";
import { createServer } from "node:net";

import type { AutoDevConfig } from "../config/types.js";
import type { DecisionRequest, DecisionResponse } from "../shared/types.js";

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

  constructor(options: SocketServerOptions) {
    this.options = options;
  }

  start(): Promise<void> {
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
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
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

    socket.on("data", async (data: Buffer) => {
      buffer += data.toString("utf-8");

      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx === -1) return;

      const message = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      let request: DecisionRequest;
      try {
        request = JSON.parse(message) as DecisionRequest;
      } catch {
        const errorResp =
          JSON.stringify({
            error: "Invalid JSON in decision request",
          }) + "\n";
        socket.write(errorResp);
        socket.end();
        return;
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
        return;
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
    });

    socket.on("error", (err: Error) => {
      console.error(`[auto-dev] Socket error: ${err.message}`);
      if (decisionId) {
        this.cleanupConnection(decisionId);
      }
    });
  }
}
