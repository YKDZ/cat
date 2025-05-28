import { File, FileMeta } from "@cat/shared";

export interface Storage {
  getId: () => string;
  getBasicPath: () => string;
  getTextContent: (file: File) => Promise<string>;
  generateUploadURL: (path: string, expiresIn: number) => Promise<string>;
  generateURL: (file: File, expiresIn: number) => Promise<string>;
  delete: (file: File) => Promise<void>;
}
