import type { AgentToolDefinition } from "@cat/agent";

import {
  assembleContextEvidence,
  executeQuery,
  getDbHandle,
} from "@cat/domain";
import * as z from "zod";

import { assertElementInSession } from "./assert-session-scope.ts";

const getNeighborsArgs = z.object({
  elementId: z
    .int()
    .positive()
    .describe("Translatable element ID to get neighbors for"),
  maxItems: z
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum number of evidence items to return"),
});

export const getNeighborsTool: AgentToolDefinition = {
  name: "get_neighbors",
  description:
    "Get context evidence (neighboring elements, annotations, screenshots) around a specific translatable element. Returns bounded flattened evidence sorted by relevance. Use this to understand the context before translating an element.",
  parameters: getNeighborsArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = getNeighborsArgs.parse(args);
    await assertElementInSession(parsed.elementId, ctx);
    const { client: db } = await getDbHandle();
    const evidence = await executeQuery({ db }, assembleContextEvidence, {
      elementId: parsed.elementId,
      purpose: "AGENT",
      maxItems: parsed.maxItems,
    });

    return { evidence };
  },
};
