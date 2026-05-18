import type {
  StructuredEvidenceInput,
  StructuredTranslatableElementInput,
} from "@cat/shared";

import { normalizeI18nText } from "@cat/source-collector";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { BootstrapLocaleCatalog } from "../schemas";

/**
 * @zh locale bridge 诊断项。
 * @en Diagnostic emitted by the locale bridge.
 */
export type LocaleBridgeDiagnostic = {
  severity: "warning" | "error";
  code:
    | "STALE_LOCALE_KEY"
    | "DUPLICATE_LOCALE_KEY"
    | "UNMATCHED_SOURCE_KEY"
    | "INVALID_LOCALE_FILE";
  message: string;
  localeId?: string;
  key?: string;
};

/**
 * @zh locale bridge 输出的记忆条目。
 * @en Translation-memory material emitted by the locale bridge.
 */
export type LocaleMemoryMaterial = {
  ref: string;
  source: string;
  translation: string;
  sourceLanguageId: string;
  translationLanguageId: string;
};

/**
 * @zh locale bridge 运行结果。
 * @en Locale bridge result.
 */
export type LocaleBridgeResult = {
  evidence: StructuredEvidenceInput[];
  memoryItems: LocaleMemoryMaterial[];
  diagnostics: LocaleBridgeDiagnostic[];
  matchedElementCount: number;
  matchedLocaleKeyCount: number;
  staleLocaleKeyCount: number;
};

const parseFlatLocaleObject = (
  raw: string,
): { entries: Record<string, string>; duplicateKeys: string[] } => {
  const duplicateKeys: string[] = [];
  const seen = new Set<string>();
  const keyPattern = /"((?:[^"\\]|\\.)*)"\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(raw)) !== null) {
    const parsedKey: unknown = JSON.parse(`"${match[1]}"`);
    if (typeof parsedKey !== "string") {
      continue;
    }
    const key = parsedKey;
    if (seen.has(key)) {
      duplicateKeys.push(key);
    }
    seen.add(key);
  }

  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Locale catalog must be a flat JSON object");
  }

  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      entries[key] = value;
    }
  }

  return { entries, duplicateKeys };
};

/**
 * @zh 基于 locale catalog 构建 bootstrap 记忆条目和证据。
 * @en Build bootstrap memory material and evidence from locale catalogs.
 *
 * @param input - {@zh locale bridge 输入} {@en Locale bridge input}
 * @returns - {@zh locale bridge 结果} {@en Locale bridge result}
 */
export const buildLocaleBridgeMaterial = async (input: {
  seedDir: string;
  elements: StructuredTranslatableElementInput[];
  catalogs: BootstrapLocaleCatalog[];
  sourceLanguageId: string;
}): Promise<LocaleBridgeResult> => {
  const diagnostics: LocaleBridgeDiagnostic[] = [];
  const evidence: StructuredEvidenceInput[] = [];
  const memoryByKey = new Map<string, LocaleMemoryMaterial>();
  const elementsBySourceText = new Map<
    string,
    StructuredTranslatableElementInput[]
  >();

  for (const element of input.elements) {
    const key = normalizeI18nText(element.text);
    const list = elementsBySourceText.get(key) ?? [];
    list.push(element);
    elementsBySourceText.set(key, list);
  }

  let matchedElementCount = 0;
  let matchedLocaleKeyCount = 0;
  let staleLocaleKeyCount = 0;

  const loadedCatalogs = await Promise.all(
    input.catalogs.map(async (catalog) => {
      const absPath = resolve(input.seedDir, catalog.path);
      try {
        return {
          catalog,
          parsed: parseFlatLocaleObject(await readFile(absPath, "utf-8")),
        };
      } catch (error) {
        return {
          catalog,
          error,
        };
      }
    }),
  );

  for (const loadedCatalog of loadedCatalogs) {
    const { catalog } = loadedCatalog;
    if ("error" in loadedCatalog) {
      const { error } = loadedCatalog;
      diagnostics.push({
        severity: "error",
        code: "INVALID_LOCALE_FILE",
        localeId: catalog.localeId,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    const { parsed } = loadedCatalog;

    for (const key of parsed.duplicateKeys) {
      diagnostics.push({
        severity: "warning",
        code: "DUPLICATE_LOCALE_KEY",
        localeId: catalog.localeId,
        key,
        message: `Duplicate locale key ${key} in ${catalog.path}`,
      });
    }

    for (const [sourceKey, targetText] of Object.entries(parsed.entries)) {
      const normalized = normalizeI18nText(sourceKey);
      const matchingElements = elementsBySourceText.get(normalized) ?? [];
      if (matchingElements.length === 0) {
        staleLocaleKeyCount += 1;
        diagnostics.push({
          severity: "warning",
          code: "STALE_LOCALE_KEY",
          localeId: catalog.localeId,
          key: sourceKey,
          message: `Locale key ${sourceKey} does not match any extracted source element`,
        });
        continue;
      }

      matchedLocaleKeyCount += 1;
      const memoryKey = `${input.sourceLanguageId}\u0000${catalog.languageId}\u0000${normalized}\u0000${targetText}`;
      if (!memoryByKey.has(memoryKey)) {
        memoryByKey.set(memoryKey, {
          ref: `mem:locale:${catalog.localeId}:${Buffer.from(normalized).toString("base64url")}`,
          source: sourceKey,
          translation: targetText,
          sourceLanguageId: input.sourceLanguageId,
          translationLanguageId: catalog.languageId,
        });
      }

      for (const element of matchingElements) {
        matchedElementCount += 1;
        evidence.push({
          attachedTo: { kind: "ELEMENT", elementRef: element.ref },
          kind: "JSON",
          displayLabel: `locale:${catalog.localeId}`,
          trustLevel: "COLLECTED",
          jsonData: {
            localeId: catalog.localeId,
            languageId: catalog.languageId,
            sourceKey,
            targetText,
            catalogPath: catalog.path,
          },
          provenance: {
            source: "bootstrap-locale-bridge",
            localeId: catalog.localeId,
          },
        });
      }
    }
  }

  for (const [sourceText, elements] of elementsBySourceText) {
    if (input.catalogs.length > 0 && elements.length > 0) {
      const hasEvidence = evidence.some((item) => {
        const attachedTo = item.attachedTo;
        if (attachedTo.kind !== "ELEMENT") {
          return false;
        }
        return elements.some(
          (element) => element.ref === attachedTo.elementRef,
        );
      });
      if (!hasEvidence) {
        diagnostics.push({
          severity: "warning",
          code: "UNMATCHED_SOURCE_KEY",
          key: sourceText,
          message: `Extracted source key ${sourceText} has no locale catalog match`,
        });
      }
    }
  }

  return {
    evidence,
    memoryItems: [...memoryByKey.values()],
    diagnostics,
    matchedElementCount,
    matchedLocaleKeyCount,
    staleLocaleKeyCount,
  };
};
