import { parseArgs } from "node:util";

import type { CliConfig } from "../config.ts";

import { withErrorReporting } from "../errors.ts";
import { mergeExtraJson } from "../utils.ts";

const HELP = `
glossary — 术语表 / 术语匹配

子命令:
  element    按元素 ID 查找术语
  text       按原始文本搜索术语

glossary element:
  --element-id <int>      元素 ID（必填）
  --lang <id>             目标翻译语言 ID（必填）
  --min-confidence <n>    最低置信度 0-1（默认: 0.6）
  --extra-json <json>     额外 JSON 参数合并到 input（可选）

glossary text:
  --project-id <uuid>     项目 ID（必填）
  --text <string>         源文本（必填）
  --source-lang <id>      源语言 ID（必填）
  --target-lang <id>      目标语言 ID（必填）
  --min-confidence <n>    最低置信度 0-1（默认: 0.6）
  --extra-json <json>     额外 JSON 参数合并到 input（可选）
`;

export const runGlossaryCommand = async (
  config: CliConfig,
  args: string[],
) => {
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
      await findByElement(config, values);
      break;
    case "text":
      await searchByText(config, values);
      break;
    default:
      console.error(
        `[ERROR] UNKNOWN_SUBCOMMAND: 'glossary ${sub}' is not valid.\n` +
          "  hint: Available subcommands: element, text.",
      );
      process.exit(1);
  }
};

const findByElement = async (
  config: CliConfig,
  values: Record<string, unknown>,
) => {
  const elementId = Number(values["element-id"]);
  const lang = values["lang"];
  const minConfidence = Number(values["min-confidence"] ?? "0.6");

  if (!Number.isInteger(elementId) || typeof lang !== "string") {
    const missing: string[] = [];
    if (!Number.isInteger(elementId))
      missing.push("--element-id (must be an integer)");
    if (typeof lang !== "string") missing.push("--lang");
    console.error(
      `[ERROR] MISSING_ARGUMENT: Required option(s) not provided: ${missing.join(", ")}.\n` +
        "  hint: cat-cli glossary element --element-id 42 --lang zh-Hans",
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

  console.log(`查找元素 ${elementId} → ${lang} 的术语匹配...`);

  await withErrorReporting(async () => {
    const stream = await config.client.glossary.findTerm(input);

    for await (const term of stream) {
      console.log(JSON.stringify(term, null, 2));
    }
  }, { path: "glossary.findTerm", input });
};

const searchByText = async (
  config: CliConfig,
  values: Record<string, unknown>,
) => {
  const projectId = values["project-id"];
  const text = values["text"];
  const sourceLang = values["source-lang"];
  const targetLang = values["target-lang"];
  const minConfidence = Number(values["min-confidence"] ?? "0.6");

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
        '  hint: cat-cli glossary text --project-id <uuid> --text "国际化" --source-lang zh --target-lang en',
    );
    process.exit(1);
  }

  const input = mergeExtraJson(
    {
      projectId,
      text,
      termLanguageId: sourceLang,
      translationLanguageId: targetLang,
      minConfidence,
    },
    values["extra-json"],
  );

  console.log(
    `搜索文本 "${text.slice(0, 50)}..." → ${targetLang} 的术语匹配...`,
  );

  await withErrorReporting(async () => {
    const stream = await config.client.glossary.searchTerm(input);

    for await (const term of stream) {
      console.log(JSON.stringify(term, null, 2));
    }
  }, { path: "glossary.searchTerm", input });
};
