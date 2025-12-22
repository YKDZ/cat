import { extname } from "node:path";
import type { TranslatableFileHandler } from "@cat/plugin-core";
import { TranslatableElementDataWithoutLanguageId } from "@cat/shared/schema/misc";
import { JSONType } from "@cat/shared/schema/json";
import * as z from "zod";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export class JSONTranslatableFileHandler implements TranslatableFileHandler {
  getId(): string {
    return "JSON";
  }

  getType(): PluginServiceType {
    return "TRANSLATABLE_FILE_HANDLER";
  }

  canExtractElement(name: string): boolean {
    return extname(name) === ".json";
  }

  async extractElement(
    fileContent: Buffer,
  ): Promise<TranslatableElementDataWithoutLanguageId[]> {
    return collectTranslatableElement(fileContent.toString("utf-8"));
  }

  canGetReplacedFileContent(name: string): boolean {
    return extname(name) === ".json";
  }

  async getReplacedFileContent(
    fileContent: Buffer,
    elements: { meta: JSONType; value: string }[],
  ): Promise<Buffer> {
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
          currentObj[part] = e.value;
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
  const result: TranslatableElementDataWithoutLanguageId[] = [];

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
        value: obj,
        meta: {
          key: currentPath,
        },
      });
    }
  };

  traverse(parsedData);
  return result;
};
