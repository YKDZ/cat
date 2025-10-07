import { extname } from "node:path";
import type { TranslatableFileHandler } from "@cat/plugin-core";
import { File } from "@cat/shared/schema/drizzle/file";
import { TranslatableElementData } from "@cat/shared/schema/misc";
import { TranslatableElement } from "@cat/shared/schema/drizzle/document";

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

  canExtractElement(file: File): boolean {
    return extname(file.originName) === ".json";
  }

  async extractElement(fileContent: Buffer) {
    return collectTranslatableElement(fileContent.toString("utf-8"));
  }

  canGetReplacedFileContent(file: File) {
    return extname(file.originName) === ".json";
  }

  async getReplacedFileContent(
    fileContent: Buffer,
    elements: Pick<TranslatableElement, "meta" | "value">[],
  ) {
    const originalObj: unknown = JSON.parse(fileContent.toString("utf-8"));
    const modifiedObj: unknown = JSON.parse(JSON.stringify(originalObj));

    for (const e of elements) {
      try {
        const meta = e.meta as {
          key: string[];
        };
        const pathParts: string[] = meta.key;

        let current: unknown = modifiedObj;
        let validPath = true;

        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          if (typeof current !== "object" || current === null) {
            validPath = false;
            break;
          }

          const currentObj = current as Record<string, unknown>;

          if (i === pathParts.length - 1) {
            currentObj[part] = e.value;
          } else {
            current = currentObj[part];
          }
        }

        if (!validPath) {
          console.warn(`路径 '${pathParts.join(".")}' 无效`);
        }
      } catch (error) {
        throw new Error("处理翻译时出错：" + error);
      }
    }

    return Buffer.from(JSON.stringify(modifiedObj, null, 2), "utf-8");
  }
}

const collectTranslatableElement = (json: string) => {
  const parsedData = JSON.parse(json);
  const result: Omit<TranslatableElementData, "languageId">[] = [];

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
