import { parseArgs } from "node:util";

import type { CliConfig } from "../config.ts";

import { withErrorReporting } from "../errors.ts";
import { mergeExtraJson } from "../utils.ts";

const HELP = `
memory — 翻译记忆查询

子命令:
  element    按元素 ID 查询记忆
  text       按原始文本查询记忆

memory element:
  --element-id <int>      元素 ID（必填）
  --lang <id>             目标翻译语言 ID（必填）
  --min-confidence <n>    最低置信度 0-1（默认: 0.72）
  --extra-json <json>     额外 JSON 参数合并到 input（可选）

memory text:
  --project-id <uuid>     项目 ID（必填）
  --text <string>         源文本（必填）
  --source-lang <id>      源语言 ID（必填）
  --target-lang <id>      目标语言 ID（必填）
  --min-confidence <n>    最低置信度 0-1（默认: 0.72）
  --extra-json <json>     额外 JSON 参数合并到 input（可选）
`;

export const runMemoryCommand = async (config: CliConfig, args: string[]) => {
  const { positionals, values } = parseArgs({
    args,
    options: {
      "element-id": { type: "string" },
      "project-id": { type: "string" },
      text: { type: "string" },
      lang: { type: "string" },
      "source-lang": { type: "string" },
      "target-lang": { type: "string" },
      "min-confidence": { type: "string" },
      "extra-json": { type: "string" },
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
    case "element":
      await recallByElement(config, values);
      break;
    case "text":
      await recallByText(config, values);
      break;
    default:
      console.error(
        `[ERROR] UNKNOWN_SUBCOMMAND: 'memory ${sub}' is not valid.\n` +
          "  hint: Available subcommands: element, text.",
      );
      process.exit(1);
  }
};

const recallByElement = async (
  config: CliConfig,
  values: Record<string, unknown>,
) => {
  const elementId = Number(values["element-id"]);
  const lang = values["lang"];
  const minConfidence = Number(values["min-confidence"] ?? "0.72");

  if (!Number.isInteger(elementId) || typeof lang !== "string") {
    const missing: string[] = [];
    if (!Number.isInteger(elementId))
      missing.push("--element-id (must be an integer)");
    if (typeof lang !== "string") missing.push("--lang");
    console.error(
      `[ERROR] MISSING_ARGUMENT: Required option(s) not provided: ${missing.join(", ")}.\n` +
        "  hint: cat-cli memory element --element-id 42 --lang zh-Hans",
    );
    process.exit(1);
  }

  const input = mergeExtraJson(
    {
      elementId,
      translationLanguageId: lang,
      minConfidence,
    },
    values["extra-json"],
  );

  console.log(`查询元素 ${elementId} → ${lang} 的翻译记忆...`);

  await withErrorReporting(async () => {
    const stream = await config.client.memory.onNew(input);

    for await (const suggestion of stream) {
      console.log(JSON.stringify(suggestion, null, 2));
    }
  }, { path: "memory.onNew", input });
};

const recallByText = async (
  config: CliConfig,
  values: Record<string, unknown>,
) => {
  const projectId = values["project-id"];
  const text = values["text"];
  const sourceLang = values["source-lang"];
  const targetLang = values["target-lang"];
  const minConfidence = Number(values["min-confidence"] ?? "0.72");

  if (
    typeof projectId !== "string" ||
    typeof text !== "string" ||
    typeof sourceLang !== "string" ||
    typeof targetLang !== "string"
  ) {
    const missing: string[] = [];
    if (typeof projectId !== "string") missing.push("--project-id");
    if (typeof text !== "string") missing.push("--text");
    if (typeof sourceLang !== "string") missing.push("--source-lang");
    if (typeof targetLang !== "string") missing.push("--target-lang");
    console.error(
      `[ERROR] MISSING_ARGUMENT: Required option(s) not provided: ${missing.join(", ")}.\n` +
        '  hint: cat-cli memory text --project-id <uuid> --text "Hello" --source-lang en --target-lang zh-Hans',
    );
    process.exit(1);
  }

  const input = mergeExtraJson(
    {
      projectId,
      text,
      sourceLanguageId: sourceLang,
      translationLanguageId: targetLang,
      minConfidence,
    },
    values["extra-json"],
  );

  console.log(
    `查询文本 "${text.slice(0, 50)}..." → ${targetLang} 的翻译记忆...`,
  );

  await withErrorReporting(async () => {
    const stream = await config.client.memory.searchByText(input);

    for await (const suggestion of stream) {
      console.log(JSON.stringify(suggestion, null, 2));
    }
  }, { path: "memory.searchByText", input });
};
