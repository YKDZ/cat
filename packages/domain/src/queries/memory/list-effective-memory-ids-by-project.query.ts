import {
  and,
  eq,
  memory,
  memoryToProject,
  personalMemoryBinding,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListEffectiveMemoryIdsByProjectQuerySchema = z.object({
  projectId: z.uuidv4(),
  userId: z.uuidv4().optional(),
});

export type ListEffectiveMemoryIdsByProjectQuery = z.infer<
  typeof ListEffectiveMemoryIdsByProjectQuerySchema
>;

export type EffectiveMemoryIds = {
  projectMemoryIds: string[];
  personalMemoryIds: string[];
  allMemoryIds: string[];
};

export const listEffectiveMemoryIdsByProject: Query<
  ListEffectiveMemoryIdsByProjectQuery,
  EffectiveMemoryIds
> = async (ctx, query) => {
  const projectRows = await ctx.db
    .select({ id: memoryToProject.memoryId })
    .from(memoryToProject)
    .innerJoin(memory, eq(memoryToProject.memoryId, memory.id))
    .where(
      and(
        eq(memoryToProject.projectId, query.projectId),
        eq(memory.scope, "PROJECT"),
      ),
    );

  const projectMemoryIds = projectRows.map((row) => row.id);

  let personalMemoryIds: string[] = [];
  if (query.userId) {
    const personalRows = await ctx.db
      .select({ id: personalMemoryBinding.memoryId })
      .from(personalMemoryBinding)
      .innerJoin(memory, eq(personalMemoryBinding.memoryId, memory.id))
      .where(
        and(
          eq(personalMemoryBinding.projectId, query.projectId),
          eq(personalMemoryBinding.userId, query.userId),
          eq(memory.scope, "PERSONAL"),
        ),
      );

    personalMemoryIds = personalRows.map((row) => row.id);
  }

  return {
    projectMemoryIds,
    personalMemoryIds,
    allMemoryIds: [...projectMemoryIds, ...personalMemoryIds],
  };
};
