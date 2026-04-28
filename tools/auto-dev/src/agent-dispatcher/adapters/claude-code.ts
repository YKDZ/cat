import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentInvoker, AgentContext, AgentEvent } from "../protocol.js";

export class ClaudeCodeAdapter implements AgentInvoker {
  async *invoke(context: AgentContext): AsyncIterable<AgentEvent> {
    const defPath = resolve(
      context.workspaceRoot,
      "tools/auto-dev/agents",
      `${context.agentDefinition}.md`,
    );
    const defContent = existsSync(defPath)
      ? readFileSync(defPath, "utf-8")
      : "";

    const prompt = `${defContent}\n\n## Issue Context\n\n${context.issueContext}`;

    const args: string[] = [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--allowedTools",
      "Bash(gh:*),Bash(git:*),Bash(auto-dev:*),Bash(pnpm:*),Read,Write,Edit,Glob,Grep",
      "--max-turns",
      "200",
    ];

    if (context.model) {
      args.push("--model", context.model);
    }

    if (context.effort) {
      args.push("--effort", context.effort);
    }

    const env = {
      ...process.env,
      CLAUDE_CODE_TOOL_TIMEOUT_MS: "86400000",
    };

    const proc = spawn("claude", args, {
      cwd: context.workspaceRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data: Buffer) => {
      // stderr is used for structured output
    });

    proc.stderr?.on("data", (data: Buffer) => {
      // stderr for logs
    });

    await new Promise<void>((resolvePromise) => {
      proc.on("close", (code: number | null) => {
        resolvePromise();
      });
    });
  }
}
