import type { IPluginService } from "@/registry/plugin-registry.ts";
import { Readable } from "node:stream";

export interface StorageProvider extends IPluginService {
  putStream(
    key: string,
    stream: Readable,
    onProgress?: (progress: {
      loaded?: number;
      total?: number;
      part?: number;
      percentage?: number;
    }) => void,
  ): Promise<void>;
  getStream(key: string): Promise<Readable>;
  getPresignedPutUrl: (key: string, expiresIn: number) => Promise<string>;
  getPresignedGetUrl(
    key: string,
    expiresIn?: number,
    fileName?: string,
  ): Promise<string>;
  head: (key: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
  ping: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
