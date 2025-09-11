import type { File } from "@cat/shared/schema/prisma/file";

export interface StorageProvider {
  getId: () => string;
  getBasicPath: () => string;
  getContent: (file: File) => Promise<Buffer>;
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
