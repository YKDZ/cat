import { and, contextProfile, eq } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { DefaultContextProfilePayload } from "@/context/default-context-profile";

export const EnsureDefaultContextProfileCommandSchema = z.object({
  projectId: z.uuidv4(),
});
export type EnsureDefaultContextProfileCommand = z.infer<
  typeof EnsureDefaultContextProfileCommandSchema
>;

export const ensureDefaultContextProfile: Command<
  EnsureDefaultContextProfileCommand,
  typeof contextProfile.$inferSelect
> = async (ctx, command) => {
  const existing = await ctx.db
    .select()
    .from(contextProfile)
    .where(
      and(
        eq(contextProfile.projectId, command.projectId),
        eq(contextProfile.name, "default"),
      ),
    )
    .limit(1);

  if (existing[0]) return { result: existing[0], events: [] };

  const inserted = await ctx.db
    .insert(contextProfile)
    .values({
      projectId: command.projectId,
      name: "default",
      payload: DefaultContextProfilePayload,
      isDefault: true,
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("Failed to create default context profile");
  return { result: row, events: [] };
};
