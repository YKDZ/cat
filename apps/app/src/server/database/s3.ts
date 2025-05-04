import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: import.meta.env.S3_REGION,
  endpoint: import.meta.env.S3_UPLOAD_BUCKET_URL,
  credentials: {
    accessKeyId: import.meta.env.S3_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.S3_SECRET_ACCESS_KEY,
  },
  forcePathStyle: Boolean(import.meta.env.S3_FORCE_PATH_STYLE),
});
