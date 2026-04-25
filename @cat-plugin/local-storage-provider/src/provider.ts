import type { JSONType } from "@cat/shared";
import type { Readable } from "node:stream";

import {
  StorageProvider,
  type DeleteContext,
  type GetPresignedGetUrlContext,
  type GetPresignedPutUrlContext,
  type GetRangeContext,
  type GetStreamContext,
  type HeadContext,
  type PutStreamContext,
} from "@cat/plugin-core";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink, access, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import * as z from "zod";

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

  async getRange({ key, start, end }: GetRangeContext): Promise<{
    data: string;
    total: number;
    actualEnd: number;
  }> {
    const filePath = this.getPath(key);
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // 读取整个文件为 UTF-8 字符串，确保正确处理多字节字符
    const fd = await open(filePath, "r");
    let fullContent: string;

    try {
      const buffer = Buffer.alloc(totalBytes);
      await fd.read(buffer, 0, totalBytes, 0);
      fullContent = buffer.toString("utf-8");
    } finally {
      await fd.close();
    }

    // 按字符位置截取（而非字节位置）
    // 使用 Number() 转换确保类型安全
    const startNum = Number(start);
    const endNum = Number(end);
    const actualEnd = Math.min(endNum, fullContent.length - 1);
    const data = fullContent.substring(startNum, actualEnd + 1);

    return {
      data,
      total: fullContent.length,
      actualEnd,
    };
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
