import { eq, memory } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetMemoryQuerySchema = z.object({
  memoryId: z.uuidv4(),
});

export type GetMemoryQuery = z.infer<typeof GetMemoryQuerySchema>;

export const getMemory: Query<
  GetMemoryQuery,
  typeof memory.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db.select().from(memory).where(eq(memory.id, query.memoryId)),
  );
};
