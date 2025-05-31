import { S3Client } from "@aws-sdk/client-s3";
import "dotenv/config";

export class S3DB {
  public static instance: S3DB;
  public client: S3Client;

  constructor() {
    if (S3DB.instance) throw Error("S3DB can only have a single instance");

    S3DB.instance = this;
    this.client = new S3Client({
      region: process.env.S3_REGION ?? "auto",
      endpoint: process.env.S3_ENDPOINT_URL,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: Boolean(process.env.S3_FORCE_PATH_STYLE),
    });
  }

  static async connect() {}

  static async disconnect() {
    S3DB.instance.client.destroy();
  }
}

new S3DB();

export const s3: S3Client = S3DB.instance.client;
