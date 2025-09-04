import { extname } from "path";
import { setting } from "./setting";
import { OverallPrismaClient } from "../types/prisma";

export const sanitizeFileName = (name: string) => {
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
