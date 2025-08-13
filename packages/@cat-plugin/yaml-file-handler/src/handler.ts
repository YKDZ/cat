import type { Pair, Scalar } from "yaml";
import {
  isScalar,
  parse,
  parseDocument,
  stringify,
  YAMLMap,
  YAMLSeq,
} from "yaml";
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
    const doc = parseDocument(content);
    const elements: TranslatableElementData[] = [];

    function traverseNode(
      node: unknown,
      path: (string | number)[] = [],
      parentComments: string | undefined = undefined,
    ): void {
      if (isScalar(node) && typeof (node as Scalar).value === "string") {
        const scalarNode = node as Scalar;
        const comment = scalarNode.commentBefore || parentComments;
        elements.push({
          value: scalarNode.value as string,
          meta: {
            path: path.join("."),
            ...(comment ? { comment } : {}),
          },
        });
      } else if (node instanceof YAMLSeq) {
        node.items.forEach((item, idx) =>
          traverseNode(
            item,
            [...path, idx],
            (item as Scalar)?.commentBefore ?? parentComments,
          ),
        );
      } else if (node instanceof YAMLMap) {
        node.items.forEach((pair: Pair) => {
          const key = isScalar(pair.key)
            ? (pair.key as Scalar).value
            : pair.key;
          traverseNode(
            pair.value,
            [...path, key as string],
            (pair.value as Scalar)?.commentBefore ?? parentComments,
          );
        });
      }
    }

    if (doc.contents) {
      traverseNode(doc.contents);
    }
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
