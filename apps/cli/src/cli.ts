#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { runAgentCommand } from "./commands/agent.ts";
import { runCallCommand } from "./commands/call.ts";
import { runGlossaryCommand } from "./commands/glossary.ts";
import { runMemoryCommand } from "./commands/memory.ts";
import { resolveConfig } from "./config.ts";

const HELP = `
cat-cli — CAT 平台命令行控制面

用法: cat-cli <command> [options]

命令:
  call       通用调用：以点分路径调用任意 oRPC handler
  agent      Agent 会话管理（带流式输出格式化）
  memory     翻译记忆查询
  glossary   术语表查询

全局选项:
  --api-url <url>    服务器地址（默认: $CAT_API_URL 或 http://localhost:3000）
  --api-key <key>    API Key  （默认: $CAT_API_KEY）
  --help, -h         显示帮助

示例:
  cat-cli call memory.get '{"memoryId":"..."}'
  cat-cli call memory.get --input-file params.json
  cat-cli agent send --session-id <uuid> -m "翻译元素 42"
  cat-cli memory text --project-id <uuid> --text "Hello" --source-lang en --target-lang zh-Hans
`;

/**
 * @zh 从文件读取 JSON 输入。
 * @en Read JSON input from a file path.
 */
const readInputFile = (filePath: string): unknown => {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : String(err);
    console.error(
      `[ERROR] INPUT_FILE_ERROR: Cannot read or parse '${filePath}'.\n` +
        `  details: ${msg}\n` +
        `  hint: Ensure the file exists and contains valid JSON.`,
    );
    process.exit(1);
  }
};

const main = async () => {
  const { positionals, values } = parseArgs({
    options: {
      "api-url": { type: "string" },
      "api-key": { type: "string" },
      "input-file": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const config = resolveConfig(values);
  const [command, ...rest] = positionals;

  // Pass input-file reader through to commands that need it
  const inputFile =
    typeof values["input-file"] === "string"
      ? readInputFile(values["input-file"])
      : undefined;

  switch (command) {
    case "call":
      await runCallCommand(config, rest, inputFile);
      break;
    case "agent":
      await runAgentCommand(config, rest);
      break;
    case "memory":
      await runMemoryCommand(config, rest);
      break;
    case "glossary":
      await runGlossaryCommand(config, rest);
      break;
    default:
      console.error(
        `[ERROR] UNKNOWN_COMMAND: '${command}' is not a valid command.\n` +
          `  hint: Available commands: call, agent, memory, glossary. Run 'cat-cli --help' for usage.`,
      );
      process.exit(1);
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
