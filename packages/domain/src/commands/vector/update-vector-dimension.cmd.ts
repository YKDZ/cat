import { sql } from "@cat/db";
import * as z from "zod";

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
  // Changing dimension invalidates all existing vectors — truncate first.
  await ctx.db.execute(sql`TRUNCATE TABLE "Vector"`);

  // HNSW index must be dropped before altering the vector column type.
  await ctx.db.execute(sql`DROP INDEX IF EXISTS "embeddingIndex"`);

  await ctx.db.execute(
    sql`ALTER TABLE "Vector" ALTER COLUMN vector TYPE vector(${sql.raw(
      command.dimension.toString(),
    )})`,
  );

  // Recreate the HNSW index for the new dimension.
  await ctx.db.execute(
    sql`CREATE INDEX "embeddingIndex" ON "Vector" USING hnsw ("vector" vector_cosine_ops)`,
  );

  return {
    result: undefined,
    events: [],
  };
};
