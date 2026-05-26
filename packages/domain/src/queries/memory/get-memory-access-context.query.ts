import { eq, memory, memoryToProject, personalMemoryBinding } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetMemoryAccessContextQuerySchema = z.object({
  memoryId: z.uuidv4(),
});

export type GetMemoryAccessContextQuery = z.infer<
  typeof GetMemoryAccessContextQuerySchema
>;

export type MemoryAccessContext = {
  memoryId: string;
  scope: "PROJECT" | "PERSONAL";
  projectIds: string[];
  personalOwnerId: string | null;
  personalProjectId: string | null;
};

export const getMemoryAccessContext: Query<
  GetMemoryAccessContextQuery,
  MemoryAccessContext | null
> = async (ctx, query) => {
  const base = assertSingleOrNull(
    await ctx.db
      .select({
        memoryId: memory.id,
        scope: memory.scope,
      })
      .from(memory)
      .where(eq(memory.id, query.memoryId))
      .limit(1),
  );

  if (!base) {
    return null;
  }

  const projectRows = await ctx.db
    .select({ projectId: memoryToProject.projectId })
    .from(memoryToProject)
    .where(eq(memoryToProject.memoryId, query.memoryId));

  const personalBinding = assertSingleOrNull(
    await ctx.db
      .select({
        userId: personalMemoryBinding.userId,
        projectId: personalMemoryBinding.projectId,
      })
      .from(personalMemoryBinding)
      .where(eq(personalMemoryBinding.memoryId, query.memoryId))
      .limit(1),
  );

  return {
    memoryId: base.memoryId,
    scope: base.scope,
    projectIds: projectRows.map((row) => row.projectId),
    personalOwnerId: personalBinding?.userId ?? null,
    personalProjectId: personalBinding?.projectId ?? null,
  };
};
