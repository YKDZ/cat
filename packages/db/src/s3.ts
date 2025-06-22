import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { setting, settings } from "./utils/setting";
import { logger } from "@cat/shared";

export class S3DB {
  public static instance: S3DB;
  public static client: S3Client;

  static async connect() {
    const setting = await settings("s3.");

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

  static async ping() {
    const bucket = (await setting("s3.bucket-name", "cat")) as string;
    await S3DB.client.send(
      new HeadBucketCommand({
        Bucket: bucket,
      }),
    );
  }
}
