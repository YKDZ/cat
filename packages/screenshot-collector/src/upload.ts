import type { CaptureResult } from "@cat/shared";

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

const encodeRpcInput = (input: unknown): string =>
  JSON.stringify({ json: input });

const decodeRpcJson = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json()) as { json: T };
  return payload.json;
};

export type UploadCaptureResultOptions = UploadOptions & {
  bindings: Record<string, string>;
};

/**
 * @zh 从 seeder bindings 中解析元素数据库 ID。
 * @en Resolve an element database ID from seeder bindings.
 *
 * @param elementRef - {@zh 元素引用} {@en Element reference}
 * @param bindings - {@zh seeder 绑定表} {@en Seeder binding map}
 * @returns - {@zh 元素数据库 ID} {@en Element database ID}
 */
export const resolveElementId = (
  elementRef: string,
  bindings: Record<string, string>,
): number => {
  const raw = bindings[`element:${elementRef}`] ?? bindings[elementRef];
  if (!raw) {
    throw new Error(`Missing element binding for ${elementRef}`);
  }
  const id = Number(raw);
  if (!Number.isInteger(id)) {
    throw new Error(`Element binding for ${elementRef} is not numeric: ${raw}`);
  }
  return id;
};

export const uploadCaptureResult = async (
  captureResult: CaptureResult,
  options: UploadCaptureResultOptions,
): Promise<{ uploadedCount: number; addedCount: number }> => {
  const { apiUrl, apiKey, projectId } = options;
  const collectionRpcUrl = new URL("/api/rpc/collection", apiUrl).href;
  const headers = {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };

  const screenshots = [] as Array<{
    elementId: number;
    elementRef: string;
    fileId: number;
    route: string;
    highlightRegion?: { x: number; y: number; width: number; height: number };
  }>;

  for (const screenshot of captureResult.screenshots) {
    const elementId =
      screenshot.elementId ??
      resolveElementId(screenshot.elementRef, options.bindings);
    const prepareRes = await fetch(`${collectionRpcUrl}/prepareUpload`, {
      method: "POST",
      headers,
      body: encodeRpcInput({
        projectId,
        fileName: screenshot.filePath.split("/").pop() ?? "screenshot.png",
      }),
    });
    if (!prepareRes.ok) {
      throw new Error(
        `prepareUpload failed for ${screenshot.filePath}: ${prepareRes.status}`,
      );
    }
    const prepareData = await decodeRpcJson<PrepareUploadResponse>(prepareRes);
    const uploadUrl = resolveUrl(prepareData.url, apiUrl);
    const fileBuffer = await readFile(screenshot.filePath);
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      body: fileBuffer,
      headers: { "content-type": "image/png" },
    });
    if (!putRes.ok) {
      throw new Error(
        `PUT upload failed for ${screenshot.filePath}: ${putRes.status}`,
      );
    }
    const finishRes = await fetch(`${collectionRpcUrl}/finishUpload`, {
      method: "POST",
      headers,
      body: encodeRpcInput({
        projectId,
        putSessionId: prepareData.putSessionId,
      }),
    });
    if (!finishRes.ok) {
      throw new Error(
        `finishUpload failed for ${screenshot.filePath}: ${finishRes.status}`,
      );
    }
    const finishData = await decodeRpcJson<{ fileId: number }>(finishRes);
    screenshots.push({
      elementId,
      elementRef: screenshot.elementRef,
      fileId: finishData.fileId,
      route: screenshot.route,
      highlightRegion: screenshot.highlightRegion,
    });
  }

  const evidenceRes = await fetch(`${collectionRpcUrl}/addScreenshotEvidence`, {
    method: "POST",
    headers,
    body: encodeRpcInput({ projectId, screenshots }),
  });
  if (!evidenceRes.ok) {
    throw new Error(
      `addScreenshotEvidence failed: ${evidenceRes.status} ${await evidenceRes.text()}`,
    );
  }
  const evidence = await decodeRpcJson<{ addedCount: number }>(evidenceRes);
  return { uploadedCount: screenshots.length, addedCount: evidence.addedCount };
};

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
  const collectionRpcUrl = new URL("/api/rpc/collection", apiUrl).href;
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
      const prepareRes = await fetch(`${collectionRpcUrl}/prepareUpload`, {
        method: "POST",
        headers,
        body: encodeRpcInput({
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

      const prepareData =
        await decodeRpcJson<PrepareUploadResponse>(prepareRes);

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
      const finishRes = await fetch(`${collectionRpcUrl}/finishUpload`, {
        method: "POST",
        headers,
        body: encodeRpcInput({
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

      const finishData = await decodeRpcJson<{ fileId: number }>(finishRes);

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
  const collectionRpcUrl = new URL("/api/rpc/collection", apiUrl).href;

  const res = await fetch(`${collectionRpcUrl}/addContexts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: encodeRpcInput({
      projectId,
      documentName,
      contexts,
    }),
  });

  if (!res.ok) {
    throw new Error(`addContexts failed: ${res.status} ${await res.text()}`);
  }

  return await decodeRpcJson<{ addedCount: number }>(res);
}
