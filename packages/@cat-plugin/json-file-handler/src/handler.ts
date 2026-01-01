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
      result.push({
        text: obj,
        meta: {
          key: currentPath,
        },
      });
    }
  };

  traverse(parsedData);
  return result;
};
