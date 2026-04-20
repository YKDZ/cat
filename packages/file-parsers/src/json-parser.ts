import * as z from "zod";

import type { ElementData, FileParser, SerializeElement } from "./types.ts";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export const jsonParser: FileParser = {
  id: "JSON",

  canParse(fileName: string): boolean {
    return fileName.endsWith(".json");
  },

  parse(content: string): ElementData[] {
    const parsedData = z.json().parse(JSON.parse(content)) as JSONValue;
    const result: ElementData[] = [];

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

    let searchOffset = 0;

    const traverse = (obj: JSONValue, currentPath: string[] = []) => {
      if (typeof obj === "object" && obj !== null) {
        if (Array.isArray(obj)) {
          obj.forEach((value, index) => {
            if (typeof value === "string")
              traverse(value, [...currentPath, index.toString()]);
          });
        } else {
          for (const key in obj) {
            if (Object.hasOwn(obj, key)) {
              const value = obj[key];
              traverse(value, [...currentPath, key]);
            }
          }
        }
      } else if (typeof obj === "string" && obj.trim() !== "") {
        const escaped = JSON.stringify(obj);
        const foundIndex = content.indexOf(escaped, searchOffset);
        let startLine: number | undefined;
        let endLine: number | undefined;
        if (foundIndex !== -1) {
          startLine = offsetToLine(foundIndex);
          endLine = offsetToLine(foundIndex + escaped.length - 1);
          searchOffset = foundIndex + escaped.length;
        }

        result.push({
          text: obj,
          meta: { key: currentPath },
          ...(startLine !== undefined && endLine !== undefined
            ? { location: { startLine, endLine } }
            : {}),
        });
      }
    };

    traverse(parsedData);
    return result;
  },

  serialize(content: string, elements: SerializeElement[]): string {
    const originalObj: unknown = JSON.parse(content);
    const modifiedObj: unknown = JSON.parse(JSON.stringify(originalObj));

    for (const e of elements) {
      const meta = z.object({ key: z.array(z.string()) }).parse(e.meta);
      const pathParts: string[] = meta.key;

      let current: unknown = modifiedObj;
      let validPath = true;

      for (let i = 0; i < pathParts.length; i += 1) {
        const part = pathParts[i];
        if (typeof current !== "object" || current === null) {
          validPath = false;
          break;
        }

        // oxlint-disable-next-line no-unsafe-type-assertion
        const currentObj = current as Record<string, unknown>;

        if (i === pathParts.length - 1) {
          currentObj[part] = e.text;
        } else {
          current = currentObj[part];
        }
      }

      if (!validPath) continue;
    }

    return JSON.stringify(modifiedObj, null, 2);
  },
};
