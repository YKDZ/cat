import * as z from "zod";

export const MemoryRecallBm25CompressionProfileSchema = z.enum([
  "bm25-ratio-k1-v1",
]);

export const MemoryRecallBm25CapabilityEntrySchema = z.object({
  languageId: z.string(),
  enabled: z.boolean(),
  textSearchConfig: z.string().nullable(),
  tokenizerLabel: z.string().nullable(),
  compressionProfile: MemoryRecallBm25CompressionProfileSchema.nullable(),
  disabledReason: z.string().nullable(),
});

export const MemoryRecallBm25CapabilityQuerySchema = z.object({
  languageIds: z.array(z.string()).default([]),
});

export const MemoryRecallBm25CapabilityDirectorySchema = z.object({
  capabilities: z.array(MemoryRecallBm25CapabilityEntrySchema),
});

export type MemoryRecallBm25CompressionProfile = z.infer<
  typeof MemoryRecallBm25CompressionProfileSchema
>;
export type MemoryRecallBm25CapabilityEntry = z.infer<
  typeof MemoryRecallBm25CapabilityEntrySchema
>;
export type MemoryRecallBm25CapabilityQuery = z.infer<
  typeof MemoryRecallBm25CapabilityQuerySchema
>;
export type MemoryRecallBm25CapabilityDirectory = z.infer<
  typeof MemoryRecallBm25CapabilityDirectorySchema
>;
