// oxlint-disable no-console
// oxlint-disable no-await-in-loop -- sequential upload: each file must complete before next (presign → PUT → finish)
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- API response JSON requires casting
import { readFile } from "node:fs/promises";

import type { CapturedScreenshot, UploadOptions } from "./types.ts";

interface PrepareUploadResponse {
  url: string;
  fileId: number;
  putSessionId: string;
}

/**
 * Resolve a potentially relative URL to an absolute one.
 * When storage is proxied, prepareUpload returns relative URLs like `/api/storage/upload/:id`.
 */
export function resolveUrl(url: string, apiUrl: string): string {
  if (url.startsWith("/")) {
    return new URL(url, apiUrl).href;
  }
  return url;
}

/**
 * Upload screenshots and return IMAGE context data list.
 * Flow: prepareUpload → PUT file → finishUpload → collect context entries.
 */
export async function uploadScreenshots(
  screenshots: CapturedScreenshot[],
  options: UploadOptions,
): Promise<
  {
    elementMeta: unknown;
    type: "IMAGE";
    data: {
      fileId: number;
      highlightRegion?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  }[]
> {
  const { apiUrl, apiKey, projectId } = options;
  const rpcUrl = new URL("/api/rpc", apiUrl).href;
  const headers = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };

  const contexts: {
    elementMeta: unknown;
    type: "IMAGE";
    data: {
      fileId: number;
      highlightRegion?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  }[] = [];

  // Deduplicate by filePath — same file may be referenced by multiple elements
  const uniqueFiles = new Map<string, CapturedScreenshot[]>();
  for (const s of screenshots) {
    const list = uniqueFiles.get(s.filePath) ?? [];
    list.push(s);
    uniqueFiles.set(s.filePath, list);
  }

  for (const [filePath, items] of uniqueFiles) {
    try {
      // 1. Prepare upload — get presigned URL + fileId + putSessionId
      const prepareRes = await fetch(`${rpcUrl}/collection.prepareUpload`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId,
          fileName: filePath.split("/").pop() ?? "screenshot.png",
        }),
      });

      if (!prepareRes.ok) {
        console.warn(
          `[WARN] prepareUpload failed for ${filePath}: ${prepareRes.status}`,
        );
        continue;
      }

      const prepareData = (await prepareRes.json()) as PrepareUploadResponse;

      // 2. Upload file to presigned URL (handle relative URLs from proxied storage)
      const uploadUrl = resolveUrl(prepareData.url, apiUrl);
      const fileBuffer = await readFile(filePath);
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: fileBuffer,
        headers: { "content-type": "image/png" },
      });

      if (!putRes.ok) {
        console.warn(
          `[WARN] PUT upload failed for ${filePath}: ${putRes.status}`,
        );
        continue;
      }

      // 3. Finalize upload — activate the file
      const finishRes = await fetch(`${rpcUrl}/collection.finishUpload`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          projectId,
          putSessionId: prepareData.putSessionId,
        }),
      });

      if (!finishRes.ok) {
        console.warn(
          `[WARN] finishUpload failed for ${filePath}: ${finishRes.status}`,
        );
        continue;
      }

      const finishData = (await finishRes.json()) as { fileId: number };

      // 4. Create context entries for elements sharing this screenshot
      for (const item of items) {
        contexts.push({
          elementMeta: item.element.meta,
          type: "IMAGE",
          data: {
            fileId: finishData.fileId,
            highlightRegion: item.highlightRegion,
          },
        });
      }
    } catch (err) {
      console.warn(
        `[WARN] Upload failed for ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return contexts;
}

/**
 * Add IMAGE contexts to existing elements via collection.addContexts endpoint.
 */
export async function addImageContexts(
  contexts: {
    elementMeta: unknown;
    type: "IMAGE";
    data: {
      fileId: number;
      highlightRegion?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    };
  }[],
  options: UploadOptions,
): Promise<{ addedCount: number }> {
  if (contexts.length === 0) return { addedCount: 0 };

  const { apiUrl, apiKey, projectId, documentName } = options;
  const rpcUrl = new URL("/api/rpc", apiUrl).href;

  const res = await fetch(`${rpcUrl}/collection.addContexts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectId,
      documentName,
      contexts,
    }),
  });

  if (!res.ok) {
    throw new Error(`addContexts failed: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as { addedCount: number };
}
