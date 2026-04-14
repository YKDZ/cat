import { parseArgs } from "node:util";

import type { CliConfig } from "../config.ts";

import { withErrorReporting } from "../errors.ts";
import { mergeExtraJson } from "../utils.ts";

const HELP = `
agent — Agent 会话管理

子命令:
  create     创建新 agent 会话
  send       向会话发送消息（流式输出响应）
  sessions   列出会话

agent create:
  --agent-id <uuid>       Agent 定义 ID（必填）
  --project-id <uuid>     项目范围（可选）
  --extra-json <json>     额外 JSON 参数合并到 input（可选）

agent send:
  --session-id <uuid>     会话 ID（必填）
  --message <text>        消息内容（必填）
  --extra-json <json>     额外 JSON 参数合并到 input（可选）

agent sessions:
  --project-id <uuid>     按项目筛选（可选）
  --extra-json <json>     额外 JSON 参数合并到 input（可选）
`;

export const runAgentCommand = async (config: CliConfig, args: string[]) => {
  const { positionals, values } = parseArgs({
    args,
    options: {
      "session-id": { type: "string" },
      "agent-id": { type: "string" },
      "project-id": { type: "string" },
      "extra-json": { type: "string" },
      message: { type: "string", short: "m" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false,
  });

  const [sub] = positionals;

  if (values.help || !sub) {
    console.log(HELP);
    return;
  }

  switch (sub) {
    case "create":
      await createSession(config, values);
      break;
    case "send":
      await sendMessage(config, values);
      break;
    case "sessions":
      await listSessions(config, values);
      break;
    default:
      console.error(
        `[ERROR] UNKNOWN_SUBCOMMAND: 'agent ${sub}' is not valid.\n` +
          "  hint: Available subcommands: create, send, sessions.",
      );
      process.exit(1);
  }
};

const createSession = async (
  config: CliConfig,
  values: Record<string, unknown>,
) => {
  const agentId = values["agent-id"];
  if (typeof agentId !== "string") {
    console.error(
      "[ERROR] MISSING_ARGUMENT: --agent-id is required.\n" +
        "  hint: Provide the agent definition UUID, e.g. --agent-id 550e8400-...",
    );
    process.exit(1);
  }

  const projectId =
    typeof values["project-id"] === "string" ? values["project-id"] : undefined;

  const input = mergeExtraJson(
    {
      agentDefinitionId: agentId,
      ...(projectId ? { projectId } : {}),
    },
    values["extra-json"],
  );

  await withErrorReporting(async () => {
    const result = await config.client.agent.createSession(input);
    console.log(JSON.stringify(result, null, 2));
  }, { path: "agent.createSession", input });
};

const sendMessage = async (
  config: CliConfig,
  values: Record<string, unknown>,
) => {
  const sessionId = values["session-id"];
  const message = values["message"];

  if (typeof sessionId !== "string" || typeof message !== "string") {
    const missing: string[] = [];
    if (typeof sessionId !== "string") missing.push("--session-id");
    if (typeof message !== "string") missing.push("--message (-m)");
    console.error(
      `[ERROR] MISSING_ARGUMENT: Required option(s) not provided: ${missing.join(", ")}.\n` +
        "  hint: cat-cli agent send --session-id <uuid> -m \"your message\"",
    );
    process.exit(1);
  }

  const input = mergeExtraJson(
    { sessionId, message },
    values["extra-json"],
  );

  console.log(`▶ 发送至会话 ${sessionId}...`);

  await withErrorReporting(async () => {
    const stream = await config.client.agent.sendMessage(input);

    let thinkingBuffer = "";

    for await (const event of stream) {
      const e = event as Record<string, unknown>;
      const type = e["type"] as string;
      const payload = (e["payload"] ?? {}) as Record<string, unknown>;

      switch (type) {
        case "run:start":
          console.log("▶ Agent 运行开始");
          break;
        case "node:start":
          console.log(`  ┌ [${payload["nodeType"]}] 开始...`);
          break;
        case "node:end":
          console.log(`  └ [${payload["nodeType"]}] 完成`);
          break;
        case "node:error":
          console.log(`  ✗ 节点错误: ${payload["error"]}`);
          break;
        case "tool:call":
          console.log(
            `  🔧 工具调用: ${payload["toolName"]} (${payload["toolCallId"]})`,
          );
          break;
        case "tool:result": {
          const content = String(payload["content"] ?? "").slice(0, 200);
          console.log(`  ✓ 工具结果: ${content}`);
          break;
        }
        case "llm:thinking": {
          const delta = String(payload["thinkingDelta"] ?? "");
          thinkingBuffer += delta;
          process.stdout.write(".");
          break;
        }
        case "llm:complete": {
          if (thinkingBuffer) {
            console.log(`\n  🧠 思考: ${thinkingBuffer.slice(0, 300)}...`);
            thinkingBuffer = "";
          }
          const text = String(payload["text"] ?? "");
          const tokens = JSON.stringify(payload["tokenUsage"] ?? {});
          console.log(`  💬 LLM 响应: ${text.slice(0, 500)}`);
          console.log(`     Tokens: ${tokens}`);
          break;
        }
        case "run:end":
          console.log("\n✅ 运行完成");
          if (payload["finalMessage"]) {
            console.log(`   最终结果: ${String(payload["finalMessage"])}`);
          }
          break;
        case "run:error":
          console.error(`\n❌ 错误: ${payload["error"]}`);
          break;
        default:
          console.log(`  [${type}] ${JSON.stringify(payload)}`);
      }
    }
  }, { path: "agent.sendMessage", input });
};

const listSessions = async (
  config: CliConfig,
  values: Record<string, unknown>,
) => {
  const projectId =
    typeof values["project-id"] === "string" ? values["project-id"] : undefined;

  const input = mergeExtraJson(
    { ...(projectId ? { projectId } : {}) },
    values["extra-json"],
  );

  await withErrorReporting(async () => {
    const sessions = await config.client.agent.listSessions(input);
    console.log(JSON.stringify(sessions, null, 2));
  }, { path: "agent.listSessions", input });
};
