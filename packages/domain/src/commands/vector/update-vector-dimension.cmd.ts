import * as z from "zod";

import type { Command } from "#/types.ts";

export const UpdateVectorDimensionCommandSchema = z.object({
  dimension: z.int().min(1),
});

export type UpdateVectorDimensionCommand = z.infer<
  typeof UpdateVectorDimensionCommandSchema
>;

export const updateVectorDimension: Command<
  UpdateVectorDimensionCommand
> = async (ctx, command) => {
  void ctx;
  throw new Error(
    `Vector dimensions are immutable at runtime (requested ${command.dimension}). Run schema preparation before starting CAT.`,
  );
};
