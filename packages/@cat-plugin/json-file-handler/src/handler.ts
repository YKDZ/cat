import type { TranslatableFileHandler } from "@cat/plugin-core";
import type { File, TranslatableElementData, Translation } from "@cat/shared";

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
    return file.Type?.mimeType === "application/json";
  }

  extractElement(file: File, fileContent: string): TranslatableElementData[] {
    return collectTranslatableElement(fileContent);
  }

  canGenerateTranslated(file: File, fileContent: string) {
    return file.Type?.mimeType === "application/json";
  }

  generateTranslated(
    file: File,
    fileContent: string,
    translations: Translation[],
  ): string {
    const originalObj: unknown = JSON.parse(fileContent);
    const modifiedObj: unknown = JSON.parse(JSON.stringify(originalObj));

    for (const translation of translations) {
      try {
        const meta = translation.TranslatableElement?.meta as {
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
            currentObj[part] = translation.value;
          } else {
            current = currentObj[part];
          }
        }

        if (!validPath) {
          console.warn(`路径 '${pathParts.join(".")}' 无效`);
        }
      } catch (error) {
        console.error("处理翻译时出错：", error);
      }
    }

    return JSON.stringify(modifiedObj, null, 2);
  }
}

const collectTranslatableElement = (
  json: string,
): TranslatableElementData[] => {
  const parsedData = JSON.parse(json);
  const result: TranslatableElementData[] = [];

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
