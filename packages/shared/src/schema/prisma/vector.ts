import z from "zod/v4";

export const VectorSchema = z.object({
  id: z.int(),
  vector: z.array(z.number()),
});

export type Vector = z.infer<typeof VectorSchema>;
