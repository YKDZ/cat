import type { PrismaClient } from "@cat/db";
import { setting } from "@cat/db";
import { Blob } from "buffer";
import { mkdirSync, writeFileSync } from "fs";
import { extname, normalize, resolve, sep } from "path";

export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  return new Blob([Buffer.from(base64, "base64")], { type: mimeType });
};

export const safeJoinPath = (
  root: string,
  subPath: string,
  filename: string,
) => {
  const normalizedSub = subPath.split("/").join(sep);
  const fullPath = resolve(root, normalize(normalizedSub), filename);
  const resolvedRoot = resolve(root);

  if (!fullPath.startsWith(resolvedRoot)) {
    throw new Error("路径超出允许的范围");
  }

  return fullPath;
};

export const saveBlobToFs = async (blob: Blob, path: string) => {
  const buffer = Buffer.from(await blob.arrayBuffer());

  mkdirSync(resolve(path, ".."), {
    recursive: true,
    mode: 0o755,
  });

  writeFileSync(path, buffer, {
    encoding: "utf-8",
  });
};

interface StringKeyValue {
  key: string;
  value: string;
}

type NestedObject = Record<string, never> | never[];

export const findStringValues = (
  obj: NestedObject,
  parentKey: string = "",
  results: StringKeyValue[] = [],
): StringKeyValue[] => {
  Object.keys(obj).forEach((key) => {
    const value = (obj as Record<string, never>)[key];
    const currentKey = parentKey ? `${parentKey}.${key}` : key;

    if (typeof value === "string" && (value as string).length !== 0) {
      results.push({ key: currentKey, value });
    } else if (typeof value === "object" && value !== null) {
      findStringValues(value, currentKey, results);
    }
  });

  return results;
};

export const sanitizeFileName = (name: string) => {
  return name.replace(/[^\w.-]/g, "_");
};

export const mimeFromFileName = async (
  fileName: string,
  prisma: Pick<PrismaClient, "setting">,
): Promise<string> => {
  const mimeMapping = await setting(
    "file-system.mime-mapping",
    { ext: "mime" } as Record<string, string>,
    prisma,
  );
  return mimeMapping[extname(fileName)] || "application/octet-stream";
};
