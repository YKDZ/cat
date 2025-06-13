import type { File } from "@cat/shared";
import type { Storage } from "./useStorage";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { S3DB, setting } from "@cat/db";

export class S3Storage implements Storage {
  constructor() {
    if (!S3DB.client) S3DB.connect();
  }

  getId() {
    return "S3";
  }

  getBasicPath() {
    return "uploads";
  }

  async getContent(file: File): Promise<Buffer> {
    const s3UploadBucketName = (await setting(
      "s3.bucket-name",
      "cat",
    )) as string;

    const command = new GetObjectCommand({
      Bucket: s3UploadBucketName,
      Key: file.storedPath.replaceAll("\\", "/"),
    });

    const response = await S3DB.client!.send(command);
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
    const s3UploadBucketName = (await setting(
      "s3.bucket-name",
      "cat",
    )) as string;

    const params: PutObjectCommandInput = {
      Bucket: s3UploadBucketName,
      Key: path.replaceAll("\\", "/"),
    } as PutObjectCommandInput;
    const command = new PutObjectCommand(params);
    const presignedUrl = await getSignedUrl(S3DB.client!, command, {
      expiresIn,
    });

    return presignedUrl;
  }

  async generateURL(path: string, expiresIn: number) {
    const s3UploadBucketName = (await setting(
      "s3.bucket-name",
      "cat",
    )) as string;

    const command = new GetObjectCommand({
      Bucket: s3UploadBucketName,
      Key: path.replaceAll("\\", "/"),
    });

    return await getSignedUrl(S3DB.client!, command, { expiresIn });
  }

  async generateDownloadURL(
    path: string,
    fileName: string,
    mimeType: string,
    expiresIn: number,
  ) {
    const s3UploadBucketName = (await setting(
      "s3.bucket-name",
      "cat",
    )) as string;

    const command = new GetObjectCommand({
      Bucket: s3UploadBucketName,
      Key: path.replaceAll("\\", "/"),
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
      ResponseContentType: mimeType,
    });

    return await getSignedUrl(S3DB.client!, command, { expiresIn });
  }

  async delete(file: File) {}
}
