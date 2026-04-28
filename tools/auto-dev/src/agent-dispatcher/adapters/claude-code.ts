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
    const rawContent = existsSync(defPath)
      ? readFileSync(defPath, "utf-8")
      : "";
    const { parseFrontmatter: parseFm, stripFrontmatter } = await import(
      "../../shared/frontmatter-parser.js"
    );
    const agentFm = parseFm(rawContent);
    const defContent = stripFrontmatter(rawContent);

    // Agent definition frontmatter provides defaults (lowest priority)
    const model = context.model ?? agentFm?.model ?? null;
    const effort = context.effort ?? agentFm?.effort ?? null;

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

    if (model) {
      args.push("--model", model);
    }

    if (effort) {
      args.push("--effort", effort);
    }

    const env = {
      ...process.env,
      CLAUDE_CODE_TOOL_TIMEOUT_MS: "86400000",
      // Ensure auto-dev CLI subcommands always resolve state from the main
      // workspace root, not from the agent's isolated worktree cwd.
      MOON_WORKSPACE_ROOT: context.workspaceRoot,
    };

    const cwd = context.agentWorkdir ?? context.workspaceRoot;

    const proc = spawn("claude", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Event queue for real-time streaming
    const queue: AgentEvent[] = [];
    let processExited = false;
    let wakeup: (() => void) | null = null;

    const push = (event: AgentEvent) => {
      queue.push(event);
      wakeup?.();
      wakeup = null;
    };

    proc.stdout?.on("data", (data: Buffer) => {
      push({ type: "stdout", data: data.toString() });
    });

    proc.stderr?.on("data", (data: Buffer) => {
      push({ type: "stderr", data: data.toString() });
    });

    proc.on("close", (code: number | null) => {
      push({ type: "exit", exitCode: code ?? 0 });
      processExited = true;
    });

    while (true) {
      if (queue.length > 0) {
        const event = queue.shift()!;
        yield event;
        if (event.type === "exit") break;
      } else if (processExited) {
        // Process closed but no exit event queued yet — shouldn't happen,
        // but guard against infinite loop.
        break;
      } else {
        // Pause until next event
        // oxlint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          wakeup = resolve;
        });
      }
    }
  }
}
