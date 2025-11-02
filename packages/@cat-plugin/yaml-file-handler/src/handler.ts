import type { Pair, Scalar } from "yaml";
import {
  isScalar,
  parse,
  parseDocument,
  stringify,
  YAMLMap,
  YAMLSeq,
} from "yaml";
import type { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import type { TranslatableFileHandler } from "@cat/plugin-core";
import { JSONType } from "@cat/shared/schema/json";
import * as z from "zod";

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

  canExtractElement(name: string): boolean {
    return name.endsWith(".yaml") || name.endsWith(".yml");
  }

  async extractElement(
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]> {
    const content = fileContent.toString("utf8");
    const doc = parseDocument(content);
    const elements: TranslatableElementDataWithoutLanguageId[] = [];

    function traverseNode(
      node: unknown,
      path: (string | number)[] = [],
      parentComments: string | undefined = undefined,
    ): void {
      if (isScalar(node) && typeof node.value === "string") {
        const scalarNode = node;
        const comment = scalarNode.commentBefore || parentComments;
        elements.push({
          // oxlint-disable-next-line no-unsafe-type-assertion
          value: scalarNode.value as string,
          meta: {
            path: path.join("."),
            ...(comment ? { comment } : {}),
          },
        });
      } else if (node instanceof YAMLSeq) {
        node.items.forEach((item, idx) => {
          traverseNode(
            item,
            [...path, idx],
            // oxlint-disable-next-line no-unsafe-type-assertion
            (item as Scalar)?.commentBefore ?? parentComments,
          );
        });
      } else if (node instanceof YAMLMap) {
        node.items.forEach((pair: Pair) => {
          const key = isScalar(pair.key) ? pair.key.value : pair.key;
          traverseNode(
            pair.value,
            // oxlint-disable-next-line no-unsafe-type-assertion
            [...path, key as string],
            // oxlint-disable-next-line no-unsafe-type-assertion
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

  canGetReplacedFileContent(name: string): boolean {
    return this.canExtractElement(name);
  }

  async getReplacedFileContent(
    fileContent: Buffer,
    elements: { meta: JSONType; value: string }[],
  ): Promise<Buffer> {
    const content = fileContent.toString("utf8");
    // oxlint-disable-next-line no-unsafe-type-assertion
    const doc = parse(content) as YamlValue;

    const translationMap = new Map<string, string>();
    for (const e of elements) {
      const meta = z.object({ path: z.string().optional() }).parse(e.meta);

      if (!meta || !meta.path) throw new Error("Translation meta is required");

      if (meta.path) {
        translationMap.set(meta.path, e.value);
      }
    }

    function applyTranslations(
      obj: YamlValue,
      path: (string | number)[] = [],
    ): YamlValue {
      if (isString(obj)) {
        const key = path.join(".");
        if (translationMap.has(key)) {
          return translationMap.get(key)!;
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
