import type { Pair, Scalar } from "yaml";

import {
  isScalar,
  parse,
  parseDocument,
  stringify,
  YAMLMap,
  YAMLSeq,
} from "yaml";
import * as z from "zod";

import type { ElementData, FileParser, SerializeElement } from "./types.ts";

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

export const yamlParser: FileParser = {
  id: "YAML",

  canParse(fileName: string): boolean {
    return fileName.endsWith(".yaml") || fileName.endsWith(".yml");
  },

  parse(content: string): ElementData[] {
    const doc = parseDocument(content);
    const elements: ElementData[] = [];

    const lines = content.split("\n");
    const lineOffsets: number[] = [];
    let offset = 0;
    for (const line of lines) {
      lineOffsets.push(offset);
      offset += line.length + 1;
    }

    const offsetToLine = (charOffset: number): number => {
      let lo = 0;
      let hi = lineOffsets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (lineOffsets[mid] <= charOffset) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      return lo + 1;
    };

    const traverseNode = (
      node: unknown,
      path: (string | number)[] = [],
      parentComments: string | undefined = undefined,
    ): void => {
      if (isScalar(node) && typeof node.value === "string") {
        const scalarNode = node;
        const comment = scalarNode.commentBefore || parentComments;
        const range = scalarNode.range;
        const location =
          range && range.length >= 2
            ? {
                startLine: offsetToLine(range[0]),
                endLine: offsetToLine(range[1] - 1),
              }
            : undefined;
        elements.push({
          // oxlint-disable-next-line no-unsafe-type-assertion
          text: scalarNode.value as string,
          meta: {
            path: path.join("."),
            ...(comment ? { comment } : {}),
          },
          ...(location ? { location } : {}),
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
    };

    if (doc.contents) {
      traverseNode(doc.contents);
    }
    return elements;
  },

  serialize(content: string, elements: SerializeElement[]): string {
    // oxlint-disable-next-line no-unsafe-type-assertion
    const doc = parse(content) as YamlValue;

    const translationMap = new Map<string, string>();
    for (const e of elements) {
      const meta = z.object({ path: z.string().optional() }).parse(e.meta);
      if (!meta || !meta.path) throw new Error("Translation meta is required");
      translationMap.set(meta.path, e.text);
    }

    function applyTranslations(
      obj: YamlValue,
      path: (string | number)[] = [],
    ): YamlValue {
      if (isString(obj)) {
        const key = path.join(".");
        if (translationMap.has(key)) return translationMap.get(key)!;
        return obj;
      } else if (isArray(obj)) {
        return obj.map((item, idx) => applyTranslations(item, [...path, idx]));
      } else if (isObject(obj)) {
        const result: YamlObject = {};
        for (const k in obj)
          result[k] = applyTranslations(obj[k], [...path, k]);
        return result;
      }
      return obj;
    }

    const translatedDoc = applyTranslations(doc);
    return stringify(translatedDoc);
  },
};
