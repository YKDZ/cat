import type { IPluginService } from "@/registry/plugin-registry.ts";

export interface StorageProvider extends IPluginService {
  getBasicPath: () => string;
  getContent: (storedPath: string) => Promise<Buffer>;
  generateUploadURL: (path: string, expiresIn: number) => Promise<string>;
  generateURL: (path: string, expiresIn: number) => Promise<string>;
  generateDownloadURL(
    path: string,
    fileName: string,
    expiresIn: number,
  ): Promise<string>;
  delete: (storedPath: string) => Promise<void>;
  ping: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
