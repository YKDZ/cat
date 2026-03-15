import { sql } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpdateVectorDimensionCommandSchema = z.object({
  dimension: z.int().min(1),
});

export type UpdateVectorDimensionCommand = z.infer<
  typeof UpdateVectorDimensionCommandSchema
>;

export const updateVectorDimension: Command<
  UpdateVectorDimensionCommand
> = async (ctx, command) => {
  await ctx.db.execute(
    sql`ALTER TABLE "Vector" ALTER COLUMN vector TYPE vector(${sql.raw(
      command.dimension.toString(),
    )})`,
  );

  return {
    result: undefined,
    events: [],
  };
};
