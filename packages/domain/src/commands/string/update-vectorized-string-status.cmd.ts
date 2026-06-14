import { inArray, vectorizedString } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const UpdateVectorizedStringStatusCommandSchema = z.object({
  stringIds: z.array(z.int()),
  status: z.string(),
});

export type UpdateVectorizedStringStatusCommand = z.infer<
  typeof UpdateVectorizedStringStatusCommandSchema
>;

/**
 * Batch-update the status of VectorizedString rows (for state machine transitions such as marking VECTORIZE_FAILED).
 */
export const updateVectorizedStringStatus: Command<
  UpdateVectorizedStringStatusCommand
> = async (ctx, command) => {
  if (command.stringIds.length === 0) {
    return { result: undefined, events: [] };
  }

  await ctx.db
    .update(vectorizedString)
    .set({ status: command.status })
    .where(inArray(vectorizedString.id, command.stringIds));

  return { result: undefined, events: [] };
};
