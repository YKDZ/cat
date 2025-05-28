import { trpc } from "@/server/trpc/client";

export const formatSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = (reader.result as string).split(",")[1];
      resolve(result);
    };
    reader.onerror = () => reject(new Error("Error reading file."));
    reader.readAsDataURL(file);
  });
};

export const saveBase64File = (data: string, fileName: string = "file") => {
  if (!data) {
    throw new Error("Base64 data is required");
  }

  try {
    const [metaData, imageData] = data.split(";base64,");
    const mimeType = metaData.split(":")[1];

    const byteCharacters = atob(imageData);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 1024) {
      const slice = byteCharacters.slice(offset, offset + 1024);
      const byteNumbers = new Array(slice.length);

      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }

      byteArrays.push(new Uint8Array(byteNumbers));
    }

    const blob = new Blob(byteArrays, { type: mimeType });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.style.display = "none";
    link.href = url;
    link.download = fileName.includes(".")
      ? fileName
      : `${fileName}.${mimeType.split("/")[1]}`;

    document.body.appendChild(link);
    link.click();

    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error saving image:", error);
    throw new Error("Failed to save image");
  }
};
