#!/usr/bin/env node

// oxlint-disable no-console
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import type { SourceExtractor } from "./types.ts";

import { toCollectionPayload } from "./adapter.ts";
import { extract } from "./extract.ts";
import { vueI18nExtractor } from "./extractors/vue-i18n.ts";

const HELP = `
source-collector — CAT 源码可翻译文本采集器

用法: source-collector <command> [options]

命令:
  extract    纯粹提取源文件中的可翻译文本，输出 ExtractionResult JSON
  collect    采集源文件中的可翻译文本，输出 CollectionPayload JSON（兼容命令）

extract 选项:
  --glob <pattern>          文件匹配模式（可重复使用多次）
  --framework <id>          提取框架：vue-i18n（默认）
  --base-dir <path>         基目录（默认：当前工作目录）
  --output, -o <path>       输出文件路径（默认：stdout）

collect 选项:
  --glob <pattern>          文件匹配模式（可重复使用多次）
  --framework <id>          提取框架：vue-i18n（默认）
  --project-id <uuid>       目标项目 ID
  --source-lang <id>        源语言 ID
  --document-name <name>    文档名称
  --base-dir <path>         基目录（默认：当前工作目录）
  --output, -o <path>       输出文件路径（默认：stdout）

  -h, --help                显示帮助

示例:
  # 纯粹提取（无需平台参数）
  source-collector extract \\
    --glob "src/**/*.{vue,ts}" \\
    --framework vue-i18n

  # 兼容命令（输出 CollectionPayload）
  source-collector collect \\
    --glob "src/**/*.{vue,ts}" \\
    --framework vue-i18n \\
    --project-id 00000000-0000-0000-0000-000000000001 \\
    --source-lang zh_cn \\
    --document-name "app-i18n"
`;

const FRAMEWORKS: Record<string, SourceExtractor> = {
  "vue-i18n": vueI18nExtractor,
};

function resolveExtractor(values: Record<string, unknown>): SourceExtractor {
  const frameworkId =
    typeof values.framework === "string" ? values.framework : "vue-i18n";
  const extractor = FRAMEWORKS[frameworkId];
  if (!extractor) {
    console.error(
      `[ERROR] UNKNOWN_FRAMEWORK: '${frameworkId}' is not supported.\n` +
        `  hint: Available frameworks: ${Object.keys(FRAMEWORKS).join(", ")}`,
    );
    process.exit(1);
  }
  return extractor;
}

function resolveGlobs(values: Record<string, unknown>): string[] {
  const rawGlob = values.glob;
  const globs = Array.isArray(rawGlob)
    ? rawGlob.filter((g): g is string => typeof g === "string")
    : [];
  if (globs.length === 0) {
    console.error(
      "[ERROR] MISSING_OPTION: --glob is required.\n" +
        "  hint: Specify one or more glob patterns, e.g. --glob 'src/**/*.vue' --glob 'src/**/*.ts'",
    );
    process.exit(1);
  }
  return globs;
}

async function runExtract(values: Record<string, unknown>): Promise<void> {
  const globs = resolveGlobs(values);
  const extractor = resolveExtractor(values);
  const baseDir = resolve(
    typeof values["base-dir"] === "string" ? values["base-dir"] : process.cwd(),
  );

  const result = await extract({
    globs,
    extractors: [extractor],
    baseDir,
  });

  const json = JSON.stringify(result, null, 2);

  if (typeof values.output === "string") {
    await writeFile(values.output, json, "utf-8");
    console.error(
      `[INFO] Extracted ${result.elements.length} elements → ${values.output}`,
    );
  } else {
    process.stdout.write(json + "\n");
  }
}

async function runCollect(values: Record<string, unknown>): Promise<void> {
  const globs = resolveGlobs(values);
  const extractor = resolveExtractor(values);
  const baseDir = resolve(
    typeof values["base-dir"] === "string" ? values["base-dir"] : process.cwd(),
  );

  const rawProjectId = values["project-id"];
  if (typeof rawProjectId !== "string" || !rawProjectId) {
    console.error(
      "[ERROR] MISSING_OPTION: --project-id is required.\n" +
        "  hint: Specify the target project UUID.",
    );
    process.exit(1);
  }

  const rawSourceLang = values["source-lang"];
  if (typeof rawSourceLang !== "string" || !rawSourceLang) {
    console.error(
      "[ERROR] MISSING_OPTION: --source-lang is required.\n" +
        "  hint: Specify the source language ID, e.g. 'zh_cn' or 'en'.",
    );
    process.exit(1);
  }

  const rawDocumentName = values["document-name"];
  if (typeof rawDocumentName !== "string" || !rawDocumentName) {
    console.error(
      "[ERROR] MISSING_OPTION: --document-name is required.\n" +
        "  hint: Specify the document name for the collection payload.",
    );
    process.exit(1);
  }

  const result = await extract({
    globs,
    extractors: [extractor],
    baseDir,
  });

  const payload = toCollectionPayload(result, {
    projectId: rawProjectId,
    sourceLanguageId: rawSourceLang,
    documentName: rawDocumentName,
  });

  const json = JSON.stringify(payload, null, 2);

  if (typeof values.output === "string") {
    await writeFile(values.output, json, "utf-8");
    console.error(
      `[INFO] Collected ${payload.elements.length} elements → ${values.output}`,
    );
  } else {
    process.stdout.write(json + "\n");
  }
}

const main = async () => {
  const { positionals, values } = parseArgs({
    options: {
      glob: { type: "string", multiple: true },
      framework: { type: "string", default: "vue-i18n" },
      "project-id": { type: "string" },
      "source-lang": { type: "string" },
      "document-name": { type: "string" },
      "base-dir": { type: "string" },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help || positionals.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const [command] = positionals;

  switch (command) {
    case "extract":
      await runExtract(values);
      break;
    case "collect":
      await runCollect(values);
      break;
    default:
      console.error(
        `[ERROR] UNKNOWN_COMMAND: '${command}' is not a valid command.\n` +
          `  hint: Available commands: extract, collect. Run 'source-collector --help' for usage.`,
      );
      process.exit(1);
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
