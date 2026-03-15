import { createHash } from "node:crypto";
import { Readable } from "node:stream";

export const readableToString = async (
  stream: Readable,
  encode: BufferEncoding = "utf8",
): Promise<string> => {
  return (await readableToBuffer(stream)).toString(encode);
};

const chunkToBuffer = (chunk: Buffer | Uint8Array | string): Buffer => {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === "string") return Buffer.from(chunk, "utf8");
  if (chunk instanceof Uint8Array) return Buffer.from(chunk);
  throw new TypeError(
    `Unsupported chunk type: ${Object.prototype.toString.call(chunk)}`,
  );
};

export async function readableToBuffer(
  stream: Readable | AsyncIterable<Uint8Array | string>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const rawChunk of stream as AsyncIterable<
    Buffer | Uint8Array | string
  >) {
    chunks.push(chunkToBuffer(rawChunk));
  }

  return Buffer.concat(chunks);
}

export const hashFromReadable = async (
  stream: Readable,
  algorithm: string = "sha256",
): Promise<Buffer> => {
  const hash = createHash(algorithm);
  for await (const chunk of stream as AsyncIterable<
    Buffer | Uint8Array | string
  >) {
    if (typeof chunk === "string") {
      hash.update(Buffer.from(chunk, "utf8"));
    } else {
      hash.update(chunk);
    }
  }
  return hash.digest();
};
