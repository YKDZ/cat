import type { Storage } from "./useStorage";
import type { File } from "@cat/shared";

export class LocalStorage implements Storage {
  getId() {
    return "LOCAL";
  }

  getBasicPath() {
    return import.meta.env.LOCAL_STORAGE_ROOT_DIR ?? "";
  }

  async getContent(file: File) {
    return Buffer.from("");
  }

  async generateUploadURL(path: string, expiresIn: number) {
    return "";
  }

  async generateURL(path: string, expiresIn: number, isDownload?: boolean) {
    return "";
  }

  async generateDownloadURL(
    path: string,
    fileName: string,
    mimeType: string,
    expiresIn: number,
  ) {
    return "";
  }

  async delete(file: File) {}
}
