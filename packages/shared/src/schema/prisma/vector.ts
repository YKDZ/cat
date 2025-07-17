import z from "zod";

export const VectorSchema = z.object({
  id: z.int(),
  vector: z.array(z.number()),
});

export type Vector = z.infer<typeof VectorSchema>;
