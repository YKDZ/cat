import type { File } from "@cat/shared";
import type { Storage } from "./Storage";
import type {
  PutObjectCommandInput} from "@aws-sdk/client-s3";
import {
  GetObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
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

  async getTextContent(file: File) {
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

    return new Promise<string>((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("error", reject);
      stream.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const content = buffer.toString("utf-8");
        resolve(content);
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

  async generateURL(file: File, expiresIn: number) {
    const s3UploadBucketName = (await setting(
      "s3.bucket-name",
      "cat",
    )) as string;

    const command = new GetObjectCommand({
      Bucket: s3UploadBucketName,
      Key: file.storedPath.replaceAll("\\", "/"),
    });

    return await getSignedUrl(S3DB.client!, command, { expiresIn });
  }

  async delete(file: File) {}
}
