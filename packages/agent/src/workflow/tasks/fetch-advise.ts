import {
  fetchAdviseOp,
  FetchAdviseInputSchema,
  FetchAdviseOutputSchema,
} from "@cat/operations";
import * as z from "zod/v4";

import { defineGraphTask } from "@/workflow/define-task";

export { FetchAdviseOutputSchema };

export const FetchAdviseWorkflowInputSchema = FetchAdviseInputSchema.extend({
  eventElementId: z.int().optional(),
  eventAdvisorId: z.int().optional(),
});

export const fetchAdviseWorkflow = defineGraphTask({
  name: "advise.fetch",
  input: FetchAdviseWorkflowInputSchema,
  output: FetchAdviseOutputSchema,
  cache: {
    enabled: true,
    ttl: 3600,
  },
  handler: async (payload, ctx) => {
    const { eventAdvisorId, eventElementId, ...opInput } = payload;
    const result = await fetchAdviseOp(opInput, ctx);

    if (eventElementId !== undefined) {
      for (const suggestion of result.suggestions) {
        ctx.addEvent({
          type: "workflow:suggestion:ready",
          payload: {
            elementId: eventElementId,
            suggestion: {
              ...suggestion,
              ...(eventAdvisorId !== undefined
                ? { advisorId: eventAdvisorId }
                : {}),
            },
          },
        });
      }
    }

    return result;
  },
});
