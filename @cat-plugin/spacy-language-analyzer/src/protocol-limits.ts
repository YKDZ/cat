export const SPACY_PROTOCOL_LIMITS = {
  maxTextUtf8Bytes: 4 * 1024 * 1024,
  maxIdUtf8Bytes: 256,
  maxBatchItems: 128,
  maxBatchTextUtf8Bytes: 8 * 1024 * 1024,
  maxTimeoutMs: 120_000,
  maxParentRequestFrameBytes: 16 * 1024 * 1024,
  maxWorkerResponseFrameBytes: 16 * 1024 * 1024,
} as const;

const utf8ByteLength = (value: string, context: string): number => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isFinite(next) || next < 0xdc00 || next > 0xdfff)
        throw new TypeError(`${context} must be valid UTF-8 text.`);
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(`${context} must be valid UTF-8 text.`);
    }
  }
  return Buffer.byteLength(value, "utf8");
};

const requireBoundedText = (
  value: string,
  limit: number,
  context: string,
): number => {
  const size = utf8ByteLength(value, context);
  if (size > limit)
    throw new RangeError(`${context} exceeds its UTF-8 byte limit.`);
  return size;
};

const requireTimeout = (timeoutMs: number): void => {
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > SPACY_PROTOCOL_LIMITS.maxTimeoutMs
  )
    throw new RangeError("spaCy timeout exceeds its protocol limit.");
};

export const serializeAnalyzeRequest = (input: {
  text: string;
  languageId: string;
  timeoutMs: number;
}): string => {
  requireBoundedText(
    input.text,
    SPACY_PROTOCOL_LIMITS.maxTextUtf8Bytes,
    "Analysis text",
  );
  requireBoundedText(
    input.languageId,
    SPACY_PROTOCOL_LIMITS.maxIdUtf8Bytes,
    "Language ID",
  );
  requireTimeout(input.timeoutMs);
  return serializeRequest(input);
};

export const serializeBatchAnalyzeRequest = (input: {
  items: ReadonlyArray<{ id: string; text: string }>;
  languageId: string;
  timeoutMs: number;
}): string => {
  if (
    input.items.length === 0 ||
    input.items.length > SPACY_PROTOCOL_LIMITS.maxBatchItems
  )
    throw new RangeError("Language analysis batch exceeds its item limit.");
  let totalTextBytes = 0;
  const ids = new Set<string>();
  for (const item of input.items) {
    if (item.id === "") throw new TypeError("Batch item ID must not be empty.");
    requireBoundedText(
      item.id,
      SPACY_PROTOCOL_LIMITS.maxIdUtf8Bytes,
      "Batch item ID",
    );
    totalTextBytes += requireBoundedText(
      item.text,
      SPACY_PROTOCOL_LIMITS.maxTextUtf8Bytes,
      "Batch item text",
    );
    if (ids.has(item.id))
      throw new TypeError("Language analysis batch item IDs must be unique.");
    ids.add(item.id);
  }
  if (totalTextBytes > SPACY_PROTOCOL_LIMITS.maxBatchTextUtf8Bytes)
    throw new RangeError(
      "Language analysis batch exceeds its total UTF-8 byte limit.",
    );
  requireBoundedText(
    input.languageId,
    SPACY_PROTOCOL_LIMITS.maxIdUtf8Bytes,
    "Language ID",
  );
  requireTimeout(input.timeoutMs);
  return serializeRequest(input);
};

const serializeRequest = (value: object): string => {
  const body = JSON.stringify(value);
  if (
    Buffer.byteLength(body, "utf8") >
    SPACY_PROTOCOL_LIMITS.maxParentRequestFrameBytes
  )
    throw new RangeError("Analysis request exceeds its protocol frame limit.");
  return body;
};
