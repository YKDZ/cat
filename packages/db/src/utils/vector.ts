import type { DefaultArgs } from "@prisma/client/runtime/client";
import type { PrismaClient } from "../generated/prisma/client";

export const insertVector = async (
  prisma: Pick<PrismaClient<never, never, DefaultArgs>, "$queryRawUnsafe">,
  vector: number[],
): Promise<number> => {
  const ids = await insertVectors(prisma, [vector]);
  if (ids.length !== 1)
    throw new Error("insert vector did not return one of id");
  return ids.at(0)!;
};

export const insertVectors = async (
  prisma: Pick<PrismaClient<never, never, DefaultArgs>, "$queryRawUnsafe">,
  vectors: number[][],
): Promise<number[]> => {
  const result = await prisma.$queryRawUnsafe<{ id: number }[]>(`
        INSERT INTO "Vector" (vector)
        VALUES ${vectors.map((v) => `('[${v.join(",")}]')`).join(",")}
        RETURNING id
      `);
  return result.map((result) => result.id);
};
