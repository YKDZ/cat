import type { CaptureResult } from "@cat/shared";

// oxlint-disable no-console
// oxlint-disable no-await-in-loop -- sequential upload: each file must complete before next (presign → PUT → finish)
// oxlint-disable typescript-eslint/no-unsafe-type-assertion -- API response JSON requires casting
import { readFile } from "node:fs/promises";

import type { UploadOptions } from "./types.ts";

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
 * Resolve an element database ID from seeder bindings.
 *
 * @param elementRef - Element reference
 * @param bindings - Seeder binding map
 * @returns - Element database ID
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
