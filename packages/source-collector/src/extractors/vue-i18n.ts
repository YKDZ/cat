import type { CollectionElement } from "@cat/shared";
import { parse as parseTemplate } from "@vue/compiler-dom";
import { parse as parseSFC } from "@vue/compiler-sfc";

import { extractFromScript } from "#/extractors/script-extract.ts";
import { extractFromTemplate } from "#/extractors/template-extract.ts";
import type { SourceExtractor } from "#/types.ts";

const sourceLanguageOptions = (
  sourceLanguageId: string | undefined,
): { sourceLanguageId?: string } =>
  sourceLanguageId === undefined ? {} : { sourceLanguageId };

/**
 * vue-i18n source extractor — extracts $t()/t() calls from Vue SFC and TS/JS files.
 */
export const vueI18nExtractor: SourceExtractor = {
  id: "vue-i18n",
  supportedExtensions: [".vue", ".ts", ".tsx", ".js", ".jsx"],

  extract({ content, filePath, sourceLanguageId }): CollectionElement[] {
    if (filePath.endsWith(".vue")) {
      return extractFromVueSFC(
        content,
        filePath,
        sourceLanguageOptions(sourceLanguageId),
      );
    }
    return extractFromScript(
      content,
      filePath,
      "file",
      0,
      sourceLanguageOptions(sourceLanguageId),
    );
  },
};

/**
 * Extract i18n calls from a Vue SFC file.
 */
function extractFromVueSFC(
  content: string,
  filePath: string,
  options: { sourceLanguageId?: string } = {},
): CollectionElement[] {
  const { descriptor, errors } = parseSFC(content, {
    filename: filePath,
  });

  if (errors.length > 0) {
    const errorMessage = errors
      .map((error) => (error instanceof Error ? error.message : String(error)))
      .join("; ");
    throw new Error(`Vue SFC parse failed for ${filePath}: ${errorMessage}`);
  }

  const elements: CollectionElement[] = [];

  if (descriptor.template) {
    const templateContent = descriptor.template.content;
    const templateStartLine = descriptor.template.loc.start.line - 1;
    const ast = parseTemplate(templateContent);

    elements.push(
      ...extractFromTemplate(ast, filePath, templateStartLine, {
        ...sourceLanguageOptions(options.sourceLanguageId),
      }),
    );
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
        sourceLanguageOptions(options.sourceLanguageId),
      ),
    );
  }

  if (descriptor.script) {
    const scriptContent = descriptor.script.content;
    const scriptStartLine = descriptor.script.loc.start.line - 1;
    elements.push(
      ...extractFromScript(
        scriptContent,
        filePath,
        "script",
        scriptStartLine,
        sourceLanguageOptions(options.sourceLanguageId),
      ),
    );
  }

  return elements;
}
