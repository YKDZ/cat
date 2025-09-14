import { extname } from "node:path";
import { setting } from "./setting.ts";
import type { OverallPrismaClient } from "@/types/prisma.ts";

export const sanitizeFileName = (name: string): string => {
  return name.replace(/[^\w.-]/g, "_");
};

export const mimeFromFileName = async (
  fileName: string,
  prisma: Pick<OverallPrismaClient, "setting">,
): Promise<string> => {
  const mimeMapping = await setting(
    "file-system.mime-mapping",
    { ext: "mime" } as Record<string, string>,
    prisma,
  );
  return mimeMapping[extname(fileName)] || "application/octet-stream";
};
