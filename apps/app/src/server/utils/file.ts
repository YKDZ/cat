import type { PrismaClient } from "@cat/db";
import { setting } from "@cat/db";
import { extname } from "path";

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
