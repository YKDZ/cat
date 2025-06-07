import { createGunzip } from "zlib";
import { x } from "tar";
import { mkdir } from "fs/promises";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { Readable } from "stream";

export async function downloadAndExtract(
  url: string,
  targetDir: string,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  const webStream = response.body as NodeReadableStream<Uint8Array>;

  const nodeStream = Readable.fromWeb(webStream);

  await pipeline(nodeStream, createGunzip(), x({ cwd: targetDir, strip: 1 }));
}
