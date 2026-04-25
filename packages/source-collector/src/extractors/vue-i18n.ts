import type { CollectionElement } from "@cat/shared";

import { parse as parseTemplate } from "@vue/compiler-dom";
import { parse as parseSFC } from "@vue/compiler-sfc";

import type { SourceExtractor } from "../types.ts";

import { extractFromScript } from "./script-extract.ts";
import { extractFromTemplate } from "./template-extract.ts";

/**
 * @zh vue-i18n 源码提取器——提取 Vue SFC 和 TS/JS 文件中的 $t()/t() 调用。
 * @en vue-i18n source extractor — extracts $t()/t() calls from Vue SFC and TS/JS files.
 */
export const vueI18nExtractor: SourceExtractor = {
  id: "vue-i18n",
  supportedExtensions: [".vue", ".ts", ".tsx", ".js", ".jsx"],

  extract({ content, filePath }): CollectionElement[] {
    if (filePath.endsWith(".vue")) {
      return extractFromVueSFC(content, filePath);
    }
    return extractFromScript(content, filePath, "file", 0);
  },
};

/**
 * @zh 从 Vue SFC 文件中提取 i18n 调用。
 * @en Extract i18n calls from a Vue SFC file.
 */
function extractFromVueSFC(
  content: string,
  filePath: string,
): CollectionElement[] {
  const { descriptor, errors } = parseSFC(content, {
    filename: filePath,
  });

  if (errors.length > 0) return [];

  const elements: CollectionElement[] = [];

  if (descriptor.template) {
    const templateContent = descriptor.template.content;
    const templateStartLine = descriptor.template.loc.start.line - 1;
    const ast = parseTemplate(templateContent);

    elements.push(...extractFromTemplate(ast, filePath, templateStartLine));
  }

  if (descriptor.scriptSetup) {
    const scriptContent = descriptor.scriptSetup.content;
    const scriptStartLine = descriptor.scriptSetup.loc.start.line - 1;
    elements.push(
      ...extractFromScript(
        scriptContent,
        filePath,
        "scriptSetup",
        scriptStartLine,
      ),
    );
  }

  if (descriptor.script) {
    const scriptContent = descriptor.script.content;
    const scriptStartLine = descriptor.script.loc.start.line - 1;
    elements.push(
      ...extractFromScript(scriptContent, filePath, "script", scriptStartLine),
    );
  }

  return elements;
}
