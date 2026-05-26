import { and, eq, memory, personalMemoryBinding } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const EnsurePersonalProjectMemoryCommandSchema = z.object({
  userId: z.uuidv4(),
  projectId: z.uuidv4(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export type EnsurePersonalProjectMemoryCommand = z.infer<
  typeof EnsurePersonalProjectMemoryCommandSchema
>;

export type EnsurePersonalProjectMemoryResult = {
  memoryId: string;
};

export const ensurePersonalProjectMemory: Command<
  EnsurePersonalProjectMemoryCommand,
  EnsurePersonalProjectMemoryResult
> = async (ctx, command) => {
  const existing = assertSingleOrNull(
    await ctx.db
      .select({
        memoryId: personalMemoryBinding.memoryId,
      })
      .from(personalMemoryBinding)
      .where(
        and(
          eq(personalMemoryBinding.userId, command.userId),
          eq(personalMemoryBinding.projectId, command.projectId),
        ),
      )
      .limit(1),
  );

  if (existing) {
    return { result: { memoryId: existing.memoryId }, events: [] };
  }

  const [created] = await ctx.db
    .insert(memory)
    .values({
      name: command.name ?? "个人记忆",
      description: command.description ?? "当前用户在当前项目内的个人翻译记忆",
      scope: "PERSONAL",
      creatorId: command.userId,
    })
    .returning({ id: memory.id });

  const insertedBinding = await ctx.db
    .insert(personalMemoryBinding)
    .values({
      memoryId: created.id,
      projectId: command.projectId,
      userId: command.userId,
    })
    .onConflictDoNothing()
    .returning({ memoryId: personalMemoryBinding.memoryId });

  if (insertedBinding.at(0)) {
    return { result: { memoryId: created.id }, events: [] };
  }

  const bound = assertSingleOrNull(
    await ctx.db
      .select({
        memoryId: personalMemoryBinding.memoryId,
      })
      .from(personalMemoryBinding)
      .where(
        and(
          eq(personalMemoryBinding.userId, command.userId),
          eq(personalMemoryBinding.projectId, command.projectId),
        ),
      )
      .limit(1),
  );

  await ctx.db.delete(memory).where(eq(memory.id, created.id));

  if (!bound) {
    throw new Error("personal memory binding was not created");
  }

  return {
    result: { memoryId: bound.memoryId },
    events: [],
  };
};
