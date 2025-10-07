import type { File } from "@cat/shared/schema/drizzle/file";
import type { IPluginService } from "@/registry/plugin-registry.ts";

export interface StorageProvider extends IPluginService {
  getBasicPath: () => string;
  getContent: (storedPath: string) => Promise<Buffer>;
  generateUploadURL: (path: string, expiresIn: number) => Promise<string>;
  generateURL: (
    path: string,
    expiresIn: number,
    isDownload?: boolean,
  ) => Promise<string>;
  generateDownloadURL(
    path: string,
    fileName: string,
    expiresIn: number,
  ): Promise<string>;
  delete: (file: File) => Promise<void>;
  ping: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
