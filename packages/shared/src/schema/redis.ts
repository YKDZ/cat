import * as z from "zod";

export const HashTypeSchema = z.union([
  z.string(),
  z.number(),
  z.instanceof(Buffer),
]);

export const RedisPayloadSchema = z.object().catchall(HashTypeSchema);

export type HashType = z.infer<typeof HashTypeSchema>;
export type RedisPayload = z.infer<typeof RedisPayloadSchema>;
