import type { Storage } from "./useStorage";
import type { File } from "@cat/shared";

export class LocalStorage implements Storage {
  async init() {}

  getId() {
    return "LOCAL";
  }

  getBasicPath() {
    return "";
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

  async generateDownloadURL(path: string, fileName: string, expiresIn: number) {
    return "";
  }

  async delete(file: File) {}

  async ping() {}

  async connect() {}

  async disconnect() {}
}
