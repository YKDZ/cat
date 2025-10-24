import type { Readable } from "node:stream";
import type { JSONType } from "@cat/shared/schema/json";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getDrizzleDB, mimeFromFileName } from "@cat/db";
import { StorageProvider } from "@cat/plugin-core";
import * as z from "zod/v4";

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

export class S3StorageProvider implements StorageProvider {
  private config: Config;
  private db: S3DB;

  constructor(config: JSONType) {
    this.config = ConfigSchema.parse(config);
    this.db = new S3DB(this.config.s3);
  }

  getId(): string {
    return "S3";
  }

  getBasicPath(): string {
    return this.config.storage["basic-path"];
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

  async getContent(storedPath: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: storedPath.replaceAll("\\", "/"),
    });

    const response = await this.db.client.send(command);
    const stream = response.Body as Readable;

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  async generateUploadURL(path: string, expiresIn: number): Promise<string> {
    const params: PutObjectCommandInput = {
      Bucket: this.config.s3["bucket-name"],
      Key: path.replaceAll("\\", "/"),
      ACL: this.config.s3["acl"],
    };
    const command = new PutObjectCommand(params);
    const presignedUrl = await getSignedUrl(this.db.client, command, {
      expiresIn,
      signableHeaders: new Set(["x-amz-checksum-sha256"]),
    });

    return presignedUrl;
  }

  async generateURL(path: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: path.replaceAll("\\", "/"),
    });

    return await getSignedUrl(this.db.client, command, { expiresIn });
  }

  async generateDownloadURL(
    path: string,
    fileName: string,
    expiresIn: number,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: path.replaceAll("\\", "/"),
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
      ResponseContentType: await mimeFromFileName(
        (await getDrizzleDB()).client,
        fileName,
      ),
    });

    return await getSignedUrl(this.db.client!, command, { expiresIn });
  }

  async delete(storedPath: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.s3["bucket-name"],
      Key: storedPath.replaceAll("\\", "/"),
    });

    await this.db.client.send(command);
  }
}
