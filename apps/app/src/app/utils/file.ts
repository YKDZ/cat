import { trpc } from "@/server/trpc/client";

export const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const uploadFile = async (file: File) => {
  const result = await trpc.document.initS3Upload.query({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  await fetch(result.presignedUrl, {
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

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = (reader.result as string).split(",")[1]; // 删除不必要的前缀
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Error reading file."));
    reader.readAsDataURL(file);
  });
};
