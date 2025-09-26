import type { OverallDrizzleClient } from "@/drizzle/db.ts";
import { vector } from "@/drizzle/schema/vector.ts";

export const insertVector = async (
  drizzle: OverallDrizzleClient,
  vector: number[],
): Promise<number> => {
  const ids = await insertVectors(drizzle, [vector]);
  if (ids.length !== 1)
    throw new Error("insert vector did not return one of id");
  return ids[0]!;
};

export const insertVectors = async (
  drizzle: OverallDrizzleClient,
  vectors: number[][],
): Promise<number[]> => {
  const result = await drizzle
    .insert(vector)
    .values(
      vectors.map((vector) => ({
        vector,
      })),
    )
    .returning({ id: vector.id });
  return result.map((result) => result.id);
};
