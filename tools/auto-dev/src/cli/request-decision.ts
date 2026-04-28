import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { parseArgs } from "node:util";

import type { DecisionRequest } from "../shared/types.js";

export const runRequestDecision = async (args: string[]): Promise<void> => {
  const { values } = parseArgs({
    args,
    options: {
      id: { type: "string" },
      "workflow-run-id": { type: "string" },
      title: { type: "string" },
      options: { type: "string" },
      recommendation: { type: "string" },
      context: { type: "string" },
    },
    strict: true,
  });

  const socketPath = process.env.AUTO_DEV_SOCKET ?? "/var/run/auto-dev.sock";

  const request: DecisionRequest = {
    id: values.id ?? randomUUID(),
    workflowRunId: values["workflow-run-id"] ?? "",
    title: values.title ?? "",
    options: JSON.parse(values.options ?? "[]"),
    recommendation: values.recommendation ?? "",
    context: values.context ?? null,
  };

  const socket = createConnection(socketPath);

  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => {
      socket.write(JSON.stringify(request) + "\n");
    });

    socket.on("data", (data: Buffer) => {
      const response = data.toString("utf-8").trim();
      try {
        const parsed = JSON.parse(response);
        if (parsed.error) {
          console.error(JSON.stringify(parsed));
          socket.end();
          resolve();
          return;
        }
        process.stdout.write(JSON.stringify(parsed) + "\n");
        socket.end();
        resolve();
      } catch {
        console.error(`Invalid response from coordinator: ${response}`);
        socket.end();
        resolve();
      }
    });

    socket.on("error", (err: Error) => {
      console.error(JSON.stringify({ error: err.message }));
      reject(err);
    });

    socket.setTimeout(0);
  });
};
