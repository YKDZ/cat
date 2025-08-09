import { parse, stringify } from "yaml";
import type { File, Translation } from "@cat/shared";
import type { TranslatableElementData } from "@cat/shared";
import type { TranslatableFileHandler } from "@cat/plugin-core";

type YamlValue = string | number | boolean | null | YamlObject | YamlArray;

interface YamlObject {
  [key: string]: YamlValue;
}

type YamlArray = YamlValue[];

function isObject(val: unknown): val is YamlObject {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function isArray(val: unknown): val is YamlArray {
  return Array.isArray(val);
}

function isString(val: unknown): val is string {
  return typeof val === "string";
}

export class YAMLTranslatableFileHandler implements TranslatableFileHandler {
  getId(): string {
    return "YAML";
  }

  canExtractElement(file: File): boolean {
    return (
      file.originName.endsWith(".yaml") || file.originName.endsWith(".yml")
    );
  }

  extractElement(file: File, fileContent: Buffer): TranslatableElementData[] {
    const content = fileContent.toString("utf8");
    const doc = parse(content) as YamlValue;
    const elements: TranslatableElementData[] = [];

    function traverse(obj: YamlValue, path: (string | number)[] = []): void {
      if (isString(obj)) {
        elements.push({
          value: obj,
          meta: { path: path.join(".") },
        });
      } else if (isArray(obj)) {
        obj.forEach((item, idx) => traverse(item, [...path, idx]));
      } else if (isObject(obj)) {
        for (const key in obj) {
          traverse(obj[key], [...path, key]);
        }
      }
    }

    traverse(doc);
    return elements;
  }

  canGenerateTranslated(file: File): boolean {
    return this.canExtractElement(file);
  }

  async generateTranslated(
    file: File,
    fileContent: Buffer,
    translations: Translation[],
  ): Promise<Buffer> {
    const content = fileContent.toString("utf8");
    const doc = parse(content) as YamlValue;

    const translationMap = new Map<string, string>();
    for (const t of translations) {
      const meta = t.TranslatableElement?.meta as { path?: string };

      if (!meta) throw new Error("Translation meta is required");

      if (meta.path) {
        translationMap.set(meta.path, t.value);
      }
    }

    function applyTranslations(
      obj: YamlValue,
      path: (string | number)[] = [],
    ): YamlValue {
      if (isString(obj)) {
        const key = path.join(".");
        if (translationMap.has(key)) {
          return translationMap.get(key) as string;
        }
        return obj;
      } else if (isArray(obj)) {
        return obj.map((item, idx) => applyTranslations(item, [...path, idx]));
      } else if (isObject(obj)) {
        const result: YamlObject = {};
        for (const k in obj) {
          result[k] = applyTranslations(obj[k], [...path, k]);
        }
        return result;
      }
      return obj;
    }

    const translatedDoc = applyTranslations(doc);
    const yamlStr = stringify(translatedDoc);
    return Buffer.from(yamlStr, "utf8");
  }
}
