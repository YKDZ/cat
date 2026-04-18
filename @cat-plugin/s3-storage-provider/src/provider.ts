import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import type { JSONType } from "@cat/shared/schema/json";
import type { Readable } from "node:stream";

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
import { join } from "node:path";
import * as z from "zod";

const S3ConfigSchema = z.object({
  "endpoint-url": z.url(),
  "bucket-name": z.string(),
  region: z.string(),
  acl: z.enum([
    "authenticated-read",
    "aws-exec-read",
    "bucket-owner-full-control",
    "bucket-owner-read",
    "private",
    "public-read",
    "public-read-write",
  ]),
  "access-key-id": z.string(),
  "secret-access-key": z.string(),
  "force-path-style": z.boolean(),
});

const StorageConfigSchema = z.object({
  "basic-path": z.string(),
});

const ConfigSchema = z.object({
  s3: S3ConfigSchema,
  storage: StorageConfigSchema,
});

type S3Config = z.infer<typeof S3ConfigSchema>;
type Config = z.infer<typeof ConfigSchema>;

class S3DB {
  public client: S3Client;
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
    this.client = new S3Client({
      region: this.config.region,
      endpoint: this.config["endpoint-url"],
      credentials: {
        accessKeyId: this.config["access-key-id"],
        secretAccessKey: this.config["secret-access-key"],
      },
      forcePathStyle: this.config["force-path-style"],
    });
  }

  async disconnect() {
    this.client.destroy();
  }

  async ping() {
    await this.client.send(
      new HeadBucketCommand({
        Bucket: this.config["bucket-name"],
      }),
    );
  }
}

export class Provider extends StorageProvider {
  private config: Config;
  private db: S3DB;

  constructor(config: JSONType) {
    // oxlint-disable-next-line no-unsafe-call
    super();
    this.config = ConfigSchema.parse(config);
    this.db = new S3DB(this.config.s3);
  }

  getId(): string {
    return "S3";
  }

  async ping(): Promise<void> {
    await this.db.ping();
  }

  async connect(): Promise<void> {
    return;
  }

  async disconnect(): Promise<void> {
    await this.db.disconnect();
  }

  async putStream({
    key,
    stream,
    onProgress,
  }: PutStreamContext): Promise<void> {
    const parallelUploads3 = new Upload({
      client: this.db.client,
      params: {
        Bucket: this.config.s3["bucket-name"],
        Key: key,
        Body: stream,
        ChecksumAlgorithm: "SHA256",
      },
      queueSize: 4,
      partSize: 1024 * 1024 * 5,
      leavePartsOnError: false,
    });

    if (onProgress) {
      parallelUploads3.on("httpUploadProgress", (progress) => {
        const percentage =
          progress.loaded && progress.total
            ? Math.round((progress.loaded / progress.total) * 100)
            : undefined;

        onProgress({
          loaded: progress.loaded,
          total: progress.total,
          part: progress.part,
          percentage,
        });
      });
    }

    await parallelUploads3.done();
  }

  async getStream({ key }: GetStreamContext): Promise<Readable> {
    const cmd = new GetObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: join(this.config.storage["basic-path"], key.replaceAll("\\", "/")),
    });
    const res = await this.db.client.send(cmd);
    // oxlint-disable-next-line no-unsafe-type-assertion
    return res.Body as Readable;
  }

  async getPresignedPutUrl({
    key,
    expiresIn,
  }: GetPresignedPutUrlContext): Promise<string> {
    const params: PutObjectCommandInput = {
      Bucket: this.config.s3["bucket-name"],
      Key: join(this.config.storage["basic-path"], key.replaceAll("\\", "/")),
      ACL: this.config.s3["acl"],
    };
    const command = new PutObjectCommand(params);
    const presignedUrl = await getSignedUrl(this.db.client, command, {
      expiresIn,
      signableHeaders: new Set(["x-amz-checksum-sha256"]),
    });

    return presignedUrl;
  }

  async getPresignedGetUrl({
    key,
    expiresIn,
    fileName,
  }: GetPresignedGetUrlContext): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: join(this.config.storage["basic-path"], key.replaceAll("\\", "/")),
      ...(fileName
        ? {
            ResponseContentDisposition: `attachment; filename="${fileName}"`,
          }
        : {}),
    });

    return await getSignedUrl(this.db.client, command, { expiresIn });
  }

  async head({ key }: HeadContext): Promise<void> {
    const command = new HeadObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: join(this.config.storage["basic-path"], key.replaceAll("\\", "/")),
    });
    await this.db.client.send(command);
  }

  async delete({ key }: DeleteContext): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: join(this.config.storage["basic-path"], key.replaceAll("\\", "/")),
    });

    await this.db.client.send(command);
  }

  async getRange({ key, start, end }: GetRangeContext): Promise<{
    data: string;
    total: number;
    actualEnd: number;
  }> {
    const fullKey = join(
      this.config.storage["basic-path"],
      key.replaceAll("\\", "/"),
    );

    const headCommand = new HeadObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: fullKey,
    });
    const headResponse = await this.db.client.send(headCommand);
    const total = headResponse.ContentLength ?? 0;

    const actualStart = Math.max(0, start);
    const actualEnd = Math.min(total - 1, end);

    if (actualStart > actualEnd) {
      return { data: "", total, actualEnd: actualStart - 1 };
    }

    const getCommand = new GetObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: fullKey,
      Range: `bytes=${actualStart}-${actualEnd}`,
    });
    const response = await this.db.client.send(getCommand);

    // oxlint-disable-next-line no-unsafe-type-assertion
    const blob = response.Body as Blob;
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 处理 UTF-8 边界：确保最后一个字符是完整的
    let sliceEnd = buffer.length;

    // 去掉末尾的 continuation bytes
    while (sliceEnd > 0) {
      const lastByte = buffer[sliceEnd - 1];
      // UTF-8 continuation bytes: 10xxxxxx (128-191)
      if (lastByte >= 128 && lastByte < 192) {
        sliceEnd -= 1;
      } else {
        break;
      }
    }

    // 检查最后一个字符是否完整
    if (sliceEnd > 0) {
      const lastByte = buffer[sliceEnd - 1];
      let expectedLength = 0;

      if (lastByte < 128) {
        expectedLength = 1;
      } else if (lastByte >= 192 && lastByte < 224) {
        expectedLength = 2;
      } else if (lastByte >= 224 && lastByte < 240) {
        expectedLength = 3;
      } else if (lastByte >= 240 && lastByte < 248) {
        expectedLength = 4;
      }

      // 如果是不完整的 UTF-8 字符，去掉起始字节
      if (expectedLength > 1 && sliceEnd >= expectedLength) {
        let isComplete = true;
        for (let i = sliceEnd - expectedLength + 1; i < sliceEnd; i += 1) {
          const byte = buffer[i];
          if (byte < 128 || byte >= 192) {
            isComplete = false;
            break;
          }
        }

        if (!isComplete) {
          sliceEnd -= 1;
        }
      }
    }

    const data = buffer.slice(0, sliceEnd).toString("utf-8");
    return { data, total, actualEnd: actualStart + sliceEnd - 1 };
  }
}
