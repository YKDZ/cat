import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { parseArgs } from "node:util";

export const runRequestDecisions = async (args: string[]): Promise<void> => {
  const { values } = parseArgs({
    args,
    options: {
      "workflow-run-id": { type: "string" },
      decisions: { type: "string" },
    },
    strict: true,
  });

  const socketPath = process.env.AUTO_DEV_SOCKET ?? "/var/run/auto-dev.sock";
  const workflowRunId = values["workflow-run-id"] ?? "";
  const rawDecisions = JSON.parse(values.decisions ?? "[]");

  const decisions = (Array.isArray(rawDecisions) ? rawDecisions : []).map(
    (d: Record<string, unknown>) => ({
      id: (d.id as string | undefined) ?? randomUUID(),
      workflowRunId: (d.workflowRunId as string | undefined) ?? workflowRunId,
      title: (d.title as string | undefined) ?? "",
      options: (d.options as unknown[] | undefined) ?? [],
      recommendation: (d.recommendation as string | undefined) ?? "",
      context: (d.context as string | null | undefined) ?? null,
    }),
  );

  if (decisions.length === 0) {
    console.error("No decisions provided. Use --decisions '[{...}]'.");
    process.exit(1);
  }

  const socket = createConnection(socketPath);
  const payload = JSON.stringify({ batch: decisions }) + "\n";

  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => {
      socket.write(payload);
    });
    socket.on("data", (data: Buffer) => {
      const response = data.toString("utf-8").trim();
      try {
        const parsed = JSON.parse(response) as Record<string, unknown>;
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
        console.error(`Invalid response: ${response}`);
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
