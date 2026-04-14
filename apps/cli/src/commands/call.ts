import type { CliConfig } from "../config.ts";

import { withErrorReporting } from "../errors.ts";
import { callByPath } from "../rpc.ts";

const HELP = `
call — 通用 oRPC 调用

用法: cat-cli call <path> [json-input]
      cat-cli call <path> --input-file <file>

参数:
  path          点分路径，如 memory.get、agent.createSession
  json-input    JSON 格式的输入参数（可选，默认 {}）

选项:
  --input-file <file>  从文件读取 JSON 输入

示例:
  cat-cli call user.me
  cat-cli call memory.get '{"memoryId":"550e8400-..."}'
  cat-cli call glossary.searchTerm --input-file params.json
`;

/**
 * @zh 通用 oRPC 调用命令。支持普通返回值和流式（AsyncIterable）返回值。
 * @en Generic oRPC call command. Supports both regular and streaming (AsyncIterable) returns.
 */
export const runCallCommand = async (
  config: CliConfig,
  args: string[],
  inputFromFile?: unknown,
) => {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    return;
  }

  const [path, rawInput] = args;
  if (!path) {
    console.error(
      "[ERROR] MISSING_PATH: No handler path specified.\n" +
        "  hint: Provide a dot-separated path, e.g. 'cat-cli call memory.get'.\n" +
        "  Run 'cat-cli call --help' for usage.",
    );
    process.exit(1);
  }

  // Resolve input: --input-file takes precedence, then positional JSON, then {}
  let input: unknown = inputFromFile ?? {};
  if (!inputFromFile && rawInput) {
    try {
      input = JSON.parse(rawInput);
    } catch {
      console.error(
        `[ERROR] INVALID_JSON: Cannot parse input as JSON.\n` +
          `  input: ${rawInput}\n` +
          `  hint: Ensure the argument is valid JSON. Wrap with single quotes: '{"key":"value"}'`,
      );
      process.exit(1);
    }
  }

  await withErrorReporting(async () => {
    const result = await callByPath(config.client, path, input);

    if (
      result != null &&
      typeof result === "object" &&
      Symbol.asyncIterator in result
    ) {
      for await (const item of result as AsyncIterable<unknown>) {
        console.log(JSON.stringify(item, null, 2));
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  }, { path, input });
};
