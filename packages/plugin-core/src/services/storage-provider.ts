import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import { Readable } from "node:stream";

export abstract class StorageProvider implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "STORAGE_PROVIDER";
  }
  abstract putStream(
    key: string,
    stream: Readable,
    onProgress?: (progress: {
      loaded?: number;
      total?: number;
      part?: number;
      percentage?: number;
    }) => void,
  ): Promise<void>;
  abstract getStream(key: string): Promise<Readable>;
  abstract getPresignedPutUrl(key: string, expiresIn: number): Promise<string>;
  abstract getPresignedGetUrl(
    key: string,
    expiresIn?: number,
    fileName?: string,
  ): Promise<string>;
  abstract head(key: string): Promise<void>;
  abstract delete(key: string): Promise<void>;
  abstract ping(): Promise<void>;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
}
