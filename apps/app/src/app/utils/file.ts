import { toShortFixed } from "@cat/shared";

export const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return toShortFixed(bytes / Math.pow(k, i), 2) + " " + sizes[i];
};

export const uploadFileToS3PresignedURL = async (file: File, url: string) => {
  await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
    mode: "cors",
    credentials: "omit",
  }).then((res) => {
    if (!res.ok) throw new Error("Error when uploading file: " + res);
  });
};
