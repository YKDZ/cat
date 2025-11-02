import type { IPluginService } from "@/registry/plugin-registry.ts";
import { Readable } from "node:stream";

export type PutStreamResult = {
  checksum: string;
  size: number;
};

export interface StorageProvider extends IPluginService {
  putStream(key: string, stream: Readable): Promise<PutStreamResult>;
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
