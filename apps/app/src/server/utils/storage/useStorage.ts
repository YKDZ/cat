import { LocalStorage } from "./LocalStorage";
import { S3Storage } from "./S3Storage";
import { Storage } from "./Storage";

const type =
  import.meta.env.STORAGE_TYPE?.trim().toLowerCase() === "s3" ? "S3" : "LOCAL";

const storage: Storage = type === "S3" ? new S3Storage() : new LocalStorage();

export const useStorage = () => {
  return {
    storage,
    type,
  };
};
