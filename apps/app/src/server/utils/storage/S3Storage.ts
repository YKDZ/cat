import { File } from "@cat/shared";
import { Storage } from "./Storage";
import {
  GetObjectCommand,
  PutObjectCommand,
  PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@cat/db";
import { Readable } from "node:stream";

export class S3Storage implements Storage {
  getId() {
    return "S3";
  }

  getBasicPath() {
    return "uploads";
  }

  async getTextContent(file: File) {
    const command = new GetObjectCommand({
      Bucket: import.meta.env.S3_UPLOAD_BUCKET_NAME,
      Key: file.storedPath.replaceAll("\\", "/"),
    });

    const response = await s3.send(command);
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
    const params: PutObjectCommandInput = {
      Bucket: import.meta.env.S3_UPLOAD_BUCKET_NAME,
      Key: path.replaceAll("\\", "/"),
    } as PutObjectCommandInput;
    const command = new PutObjectCommand(params);
    const presignedUrl = await getSignedUrl(s3, command, {
      expiresIn,
    });

    return presignedUrl;
  }

  async generateURL(file: File, expiresIn: number) {
    const command = new GetObjectCommand({
      Bucket: import.meta.env.S3_UPLOAD_BUCKET_NAME,
      Key: file.storedPath.replaceAll("\\", "/"),
    });

    return await getSignedUrl(s3, command, { expiresIn });
  }

  async delete(file: File) {}
}
