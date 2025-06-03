import { setting } from "@cat/db";
import { LocalStorage } from "./LocalStorage";
import { S3Storage } from "./S3Storage";

export const useStorage = async () => {
  const type = (await setting("server.storage-type", "local")) as string;
  return {
    storage: type === "S3" ? new S3Storage() : new LocalStorage(),
    type,
  };
};
