import { toShortFixed } from "@cat/shared";

export const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return toShortFixed(bytes / Math.pow(k, i), 2) + " " + sizes[i];
};

export const uploadFileToS3PresignedURL = async (file: File, url: string) => {
  const arrayBuffer = await file.arrayBuffer();

  // 使用 Web Crypto API 计算 SHA-256
  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const checksumSHA256 = btoa(
    String.fromCharCode(...new Uint8Array(digestBuffer)),
  );

  await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "x-amz-checksum-sha256": checksumSHA256,
    },
    body: file,
    mode: "cors",
    credentials: "omit",
  }).then((res) => {
    if (!res.ok) throw new Error("Error when uploading file: " + res);
  });
};
