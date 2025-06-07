import type { Storage } from "./Storage";
import type { File } from "@cat/shared";

export class LocalStorage implements Storage {
  getId() {
    return "LOCAL";
  }

  getBasicPath() {
    return import.meta.env.LOCAL_STORAGE_ROOT_DIR ?? "";
  }

  async getTextContent(file: File) {
    return "";
  }

  async generateUploadURL(path: string, expiresIn: number) {
    return "";
  }

  async generateURL(file: File, expiresIn: number) {
    return "";
  }

  async delete(file: File) {}
}
