import type { File, JSONType } from "@cat/shared";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import { S3Client } from "@aws-sdk/client-s3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { getPrismaDB, mimeFromFileName } from "@cat/db";
import { StorageProvider } from "@cat/plugin-core";
import { z } from "zod";

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

type S3Config = z.infer<typeof S3ConfigSchema>;
type StorageConfig = z.infer<typeof StorageConfigSchema>;

class S3DB {
  public static client: S3Client;
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
  }

  async connect() {
    S3DB.client = new S3Client({
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
    S3DB.client.destroy();
  }

  async ping() {
    await S3DB.client.send(
      new HeadBucketCommand({
        Bucket: this.config["bucket-name"],
      }),
    );
  }
}

export class S3StorageProvider implements StorageProvider {
  private configs: Record<string, JSONType>;
  private s3Config: S3Config;
  private storageConfig: StorageConfig;
  private db: S3DB;

  private config = <T>(key: string, fallback: T): T => {
    const config = this.configs[key];
    if (!config) return fallback;
    return config as T;
  };

  constructor(configs: Record<string, JSONType>) {
    this.configs = configs;
    this.s3Config = S3ConfigSchema.parse(this.config("s3", {}));
    this.storageConfig = StorageConfigSchema.parse(this.config("storage", {}));
    this.db = new S3DB(this.s3Config);
  }

  getId() {
    return "S3";
  }

  getBasicPath() {
    return this.config("storage", { "basic-path": "uploads" })["basic-path"];
  }

  async ping() {
    await this.db.ping();
  }

  async connect() {
    if (!S3DB.client) await this.db.connect();
  }

  async disconnect() {
    await this.db.disconnect();
  }

  async getContent(file: File): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.s3Config["bucket-name"],
      Key: file.storedPath.replaceAll("\\", "/"),
    });

    const response = await S3DB.client.send(command);
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

  async generateUploadURL(path: string, expiresIn: number) {
    const params: PutObjectCommandInput = {
      Bucket: this.s3Config["bucket-name"],
      Key: path.replaceAll("\\", "/"),
      ACL: this.s3Config["acl"],
    };
    const command = new PutObjectCommand(params);
    const presignedUrl = await getSignedUrl(S3DB.client!, command, {
      expiresIn,
      signableHeaders: new Set(["x-amz-checksum-sha256"]),
    });

    return presignedUrl;
  }

  async generateURL(path: string, expiresIn: number) {
    const command = new GetObjectCommand({
      Bucket: this.s3Config["bucket-name"],
      Key: path.replaceAll("\\", "/"),
    });

    return await getSignedUrl(S3DB.client!, command, { expiresIn });
  }

  async generateDownloadURL(path: string, fileName: string, expiresIn: number) {
    const command = new GetObjectCommand({
      Bucket: this.s3Config["bucket-name"],
      Key: path.replaceAll("\\", "/"),
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
      ResponseContentType: await mimeFromFileName(
        fileName,
        (await getPrismaDB()).client,
      ),
    });

    return await getSignedUrl(S3DB.client!, command, { expiresIn });
  }

  async delete(file: File) {
    const command = new DeleteObjectCommand({
      Bucket: this.s3Config["bucket-name"],
      Key: file.storedPath.replaceAll("\\", "/"),
    });

    await S3DB.client.send(command);
  }
}
