import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { JSONType } from "@cat/shared/schema/json";
import {
  StorageProvider,
  type DeleteContext,
  type GetPresignedGetUrlContext,
  type GetPresignedPutUrlContext,
  type GetStreamContext,
  type HeadContext,
  type PutStreamContext,
} from "@cat/plugin-core";
import * as z from "zod/v4";
import { dirname, resolve } from "node:path";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink, access } from "node:fs/promises";

const ConfigSchema = z.object({
  "root-path": z.string().default("./storage"),
});

type Config = z.infer<typeof ConfigSchema>;

export class Provider extends StorageProvider {
  private config: Config;

  constructor(config: JSONType) {
    // oxlint-disable-next-line no-unsafe-call
    super();
    this.config = ConfigSchema.parse(config);
  }

  getId(): string {
    return "LOCAL";
  }

  override shouldProxy(): boolean {
    return true;
  }

  private getPath(key: string): string {
    const basePath = resolve(process.cwd(), this.config["root-path"]);
    const fullPath = resolve(basePath, key);
    if (!fullPath.startsWith(basePath)) {
      throw new Error("Invalid key: Path traversal detected");
    }
    return fullPath;
  }

  async ping(): Promise<void> {
    const basePath = resolve(process.cwd(), this.config["root-path"]);
    await access(basePath);
  }

  async connect(): Promise<void> {
    const basePath = resolve(process.cwd(), this.config["root-path"]);
    await mkdir(basePath, { recursive: true });
  }

  // oxlint-disable-next-line no-empty-function
  async disconnect(): Promise<void> {}

  async putStream({
    key,
    stream,
    onProgress,
  }: PutStreamContext): Promise<void> {
    const filePath = this.getPath(key);
    await mkdir(dirname(filePath), { recursive: true });
    const writeStream = createWriteStream(filePath);

    if (onProgress) {
      let loaded = 0;
      stream.on("data", (chunk: Buffer) => {
        loaded += chunk.length;
        onProgress({ loaded });
      });
    }

    await pipeline(stream, writeStream);
  }

  async getStream({ key }: GetStreamContext): Promise<Readable> {
    const filePath = this.getPath(key);
    return createReadStream(filePath);
  }

  async getPresignedPutUrl(_ctx: GetPresignedPutUrlContext): Promise<string> {
    throw new Error("Method not implemented. Use proxy.");
  }

  async getPresignedGetUrl(_ctx: GetPresignedGetUrlContext): Promise<string> {
    throw new Error("Method not implemented. Use proxy.");
  }

  async head({ key }: HeadContext): Promise<void> {
    const filePath = this.getPath(key);
    await stat(filePath);
  }

  async delete({ key }: DeleteContext): Promise<void> {
    const filePath = this.getPath(key);
    await unlink(filePath);
  }
}
