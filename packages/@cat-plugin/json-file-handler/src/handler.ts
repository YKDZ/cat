import {
  FileExporter,
  FileImporter,
  type CanExportContext,
  type CanImportContext,
  type ElementData,
  type ExportContext,
  type ImportContext,
} from "@cat/plugin-core";
import { extname } from "node:path";
import * as z from "zod";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export class Importer extends FileImporter {
  getId(): string {
    return "JSON";
  }

  canImport({ name }: CanImportContext): boolean {
    return extname(name) === ".json";
  }

  async import({ fileContent }: ImportContext): Promise<ElementData[]> {
    return collectTranslatableElement(fileContent.toString("utf-8"));
  }
}

export class Exporter extends FileExporter {
  getId(): string {
    return "JSON";
  }

  canExport({ name }: CanExportContext): boolean {
    return extname(name) === ".json";
  }

  async export({ fileContent, elements }: ExportContext): Promise<Buffer> {
    const originalObj: unknown = JSON.parse(fileContent.toString("utf-8"));
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

    return Buffer.from(JSON.stringify(modifiedObj, null, 2), "utf-8");
  }
}

const collectTranslatableElement = (json: string) => {
  const parsedData = z.json().parse(JSON.parse(json));
  const result: ElementData[] = [];

  // 按行分割用于行号计算
  const lines = json.split("\n");
  // 构建每行起始字符偏移量的累计表
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1; // +1 for '\n'
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
    return lo + 1; // 1-based
  };

  // 用于在原始文本中搜索字符串值位置的当前搜索偏移
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
      // 在原始 JSON 文本中查找该字符串值的位置
      const escaped = JSON.stringify(obj);
      const foundIndex = json.indexOf(escaped, searchOffset);
      let startLine: number | undefined;
      let endLine: number | undefined;
      if (foundIndex !== -1) {
        startLine = offsetToLine(foundIndex);
        endLine = offsetToLine(foundIndex + escaped.length - 1);
        searchOffset = foundIndex + escaped.length;
      }

      result.push({
        text: obj,
        meta: {
          key: currentPath,
        },
        ...(startLine !== undefined && endLine !== undefined
          ? { location: { startLine, endLine } }
          : {}),
      });
    }
  };

  traverse(parsedData);
  return result;
};
