import { setting } from "@cat/db";
import { LocalStorage } from "./LocalStorage";
import { S3Storage } from "./S3Storage";
import type { File } from "@cat/shared";

export interface Storage {
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
    mimeType: string,
    expiresIn: number,
  ): Promise<string>;
  delete: (file: File) => Promise<void>;
}

export const useStorage = async (): Promise<{
  storage: Storage;
  type: string;
}> => {
  const type = (await setting("server.storage-type", "local")) as string;
  return {
    storage: type === "S3" ? new S3Storage() : new LocalStorage(),
    type,
  };
};
