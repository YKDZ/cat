import type { IPluginService } from "@/services/service";
import type { PluginServiceType } from "@cat/shared/schema/drizzle/enum";
import { Readable } from "node:stream";

export type PutStreamContext = {
  key: string;
  stream: Readable;
  onProgress?: (progress: {
    loaded?: number;
    total?: number;
    part?: number;
    percentage?: number;
  }) => void;
};

export type GetStreamContext = {
  key: string;
};

export type GetPresignedPutUrlContext = {
  key: string;
  expiresIn: number;
};

export type GetPresignedGetUrlContext = {
  key: string;
  expiresIn: number;
  fileName?: string;
};

export type HeadContext = {
  key: string;
};

export type DeleteContext = {
  key: string;
};

export abstract class StorageProvider implements IPluginService {
  abstract getId(): string;
  getType(): PluginServiceType {
    return "STORAGE_PROVIDER";
  }
  abstract putStream(ctx: PutStreamContext): Promise<void>;
  abstract getStream(ctx: GetStreamContext): Promise<Readable>;
  abstract getPresignedPutUrl(ctx: GetPresignedPutUrlContext): Promise<string>;
  abstract getPresignedGetUrl(ctx: GetPresignedGetUrlContext): Promise<string>;
  abstract head(ctx: HeadContext): Promise<void>;
  abstract delete(ctx: DeleteContext): Promise<void>;
  abstract ping(): Promise<void>;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
}
