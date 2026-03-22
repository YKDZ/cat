import {
  fetchAdviseOp,
  FetchAdviseInputSchema,
  FetchAdviseOutputSchema,
} from "@cat/operations";
import * as z from "zod/v4";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";

export { FetchAdviseOutputSchema };

export const FetchAdviseWorkflowInputSchema = FetchAdviseInputSchema.extend({
  eventElementId: z.int().optional(),
  eventAdvisorId: z.int().optional(),
});

export const fetchAdviseGraph = defineTypedGraph({
  id: "advise-fetch",
  input: FetchAdviseWorkflowInputSchema,
  output: FetchAdviseOutputSchema,
  nodes: {
    main: defineNode({
      input: FetchAdviseWorkflowInputSchema,
      output: FetchAdviseOutputSchema,
      handler: async (input, ctx) => {
        const { eventAdvisorId, eventElementId, ...opInput } = input;
        const result = await fetchAdviseOp(opInput, {
          traceId: ctx.traceId,
          signal: ctx.signal,
          pluginManager: ctx.pluginManager,
        });
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
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

/** @deprecated use fetchAdviseGraph */
export const fetchAdviseWorkflow = fetchAdviseGraph;
