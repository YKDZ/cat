import { extname } from "node:path";
import { getSetting } from "./setting.ts";
import type { OverallDrizzleClient } from "@/drizzle/db.ts";

export const sanitizeFileName = (name: string): string => {
  return name.replace(/[^\w.-]/g, "_");
};

export const mimeFromFileName = async (
  drizzle: OverallDrizzleClient,
  fileName: string,
): Promise<string> => {
  const mimeMapping = await getSetting(drizzle, "file-system.mime-mapping", {
    ext: "mime",
  } as Record<string, string>);
  return mimeMapping[extname(fileName)] || "application/octet-stream";
};
