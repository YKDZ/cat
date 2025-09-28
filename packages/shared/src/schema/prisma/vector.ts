import * as z from "zod/v4";
import { safeZDotJson } from "../json.ts";

export const VectorSchema = z.object({
  id: z.int(),
  vector: z.array(z.number()),
  vectorizerId: z.number(),
  meta: safeZDotJson,
});

export type Vector = z.infer<typeof VectorSchema>;
