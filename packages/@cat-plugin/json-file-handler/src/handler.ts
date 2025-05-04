import { TranslatableFileHandler } from "@cat/plugin-core";
import {
  File,
  Document,
  TranslatableElementData,
  Translation,
} from "@cat/shared";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export class JSONTranslatableFileHandler implements TranslatableFileHandler {
  detectDocumentTypeFromFile(file: File): string | void {
    if (file.originName.endsWith(".json")) return "JSON";
  }

  canExtractElementFromFile(document: Document, fileContent: string): boolean {
    return document.Type.name === "JSON";
  }

  extractElementFromFile(
    document: Document,
    fileContent: string,
  ): TranslatableElementData[] {
    return collectTranslatableElement(fileContent);
  }

  canGenerateTranslatedFile(document: Document, fileContent: string) {
    return document.Type.name === "JSON";
  }

  generateTranslatedFile(
    document: Document,
    fileContent: string,
    translations: Translation[],
  ): string {
    const originalObj: unknown = JSON.parse(fileContent);
    const modifiedObj: unknown = JSON.parse(JSON.stringify(originalObj));

    for (const translation of translations) {
      try {
        const meta = JSON.parse(translation.TranslatableElement?.meta ?? "");
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
        meta: JSON.stringify({
          key: currentPath,
        }),
      });
    }
  };

  traverse(parsedData);
  return result;
};
