import type { File } from "@cat/shared";
import type { Storage } from "./useStorage";
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
import type { PrismaClient } from "@cat/db";
import { getPrismaDB, setting, settings } from "@cat/db";
import { mimeFromFileName } from "../file";

class S3DB {
  public static client: S3Client;

  static async connect(prisma: PrismaClient) {
    const setting = await settings("s3.", prisma);

    S3DB.client = new S3Client({
      region: (setting["s3.region"] as string) ?? "auto",
      endpoint: (setting["s3.endpoint-url"] as string) ?? "",
      credentials: {
        accessKeyId: (setting["s3.access-key-id"] as string) ?? "",
        secretAccessKey: (setting["s3.secret-access-key"] as string) ?? "",
      },
      forcePathStyle: Boolean(setting["s3.force-path-style"]),
    });
  }

  static async disconnect() {
    S3DB.client.destroy();
  }

  static async ping(prisma: PrismaClient) {
    const bucket = await setting("s3.bucket-name", "cat", prisma);
    await S3DB.client.send(
      new HeadBucketCommand({
        Bucket: bucket,
      }),
    );
  }
}

export class S3Storage implements Storage {
  getId() {
    return "S3";
  }

  getBasicPath() {
    return "uploads";
  }

  async ping() {
    await S3DB.ping((await getPrismaDB()).client);
  }

  async connect() {
    if (!S3DB.client) await S3DB.connect((await getPrismaDB()).client);
  }

  async disconnect() {
    await S3DB.disconnect();
  }

  async getContent(file: File): Promise<Buffer> {
    const s3UploadBucketName = await setting(
      "s3.bucket-name",
      "cat",
      (await getPrismaDB()).client,
    );

    const command = new GetObjectCommand({
      Bucket: s3UploadBucketName,
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
    const s3UploadBucketName = await setting(
      "s3.bucket-name",
      "cat",
      (await getPrismaDB()).client,
    );

    const params: PutObjectCommandInput = {
      Bucket: s3UploadBucketName,
      Key: path.replaceAll("\\", "/"),
      ACL: await setting("s3.acl", "private", (await getPrismaDB()).client),
    };
    const command = new PutObjectCommand(params);
    const presignedUrl = await getSignedUrl(S3DB.client!, command, {
      expiresIn,
      signableHeaders: new Set(["x-amz-checksum-sha256"]),
    });

    return presignedUrl;
  }

  async generateURL(path: string, expiresIn: number) {
    const s3UploadBucketName = await setting(
      "s3.bucket-name",
      "cat",
      (await getPrismaDB()).client,
    );

    const command = new GetObjectCommand({
      Bucket: s3UploadBucketName,
      Key: path.replaceAll("\\", "/"),
    });

    return await getSignedUrl(S3DB.client!, command, { expiresIn });
  }

  async generateDownloadURL(path: string, fileName: string, expiresIn: number) {
    const s3UploadBucketName = await setting(
      "s3.bucket-name",
      "cat",
      (await getPrismaDB()).client,
    );

    const command = new GetObjectCommand({
      Bucket: s3UploadBucketName,
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
    const s3UploadBucketName = await setting(
      "s3.bucket-name",
      "cat",
      (await getPrismaDB()).client,
    );

    const command = new DeleteObjectCommand({
      Bucket: s3UploadBucketName,
      Key: file.storedPath.replaceAll("\\", "/"),
    });

    await S3DB.client.send(command);
  }
}
