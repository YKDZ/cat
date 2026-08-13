import {
  fetchAdviseOp,
  FetchAdviseInputSchema,
  FetchAdviseOutputSchema,
} from "@cat/operations";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import * as z from "zod";

import { defineNode, defineGraph } from "#/graph/dsl/index.ts";

export { FetchAdviseOutputSchema };

export const FetchAdviseWorkflowInputSchema = FetchAdviseInputSchema.extend({
  eventElementId: z.int().optional(),
  eventAdvisor: ServiceImplementationReferenceSchema.optional(),
});

export const fetchAdviseGraph = defineGraph({
  id: "advise-fetch",
  input: FetchAdviseWorkflowInputSchema,
  output: FetchAdviseOutputSchema,
  nodes: {
    main: defineNode({
      input: FetchAdviseWorkflowInputSchema,
      output: FetchAdviseOutputSchema,
      handler: async (input, ctx) => {
        const { eventAdvisor, eventElementId, ...opInput } = input;
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
                  ...(eventAdvisor !== undefined
                    ? { advisor: eventAdvisor }
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
