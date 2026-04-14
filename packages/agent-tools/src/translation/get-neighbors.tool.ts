import type { AgentToolDefinition } from "@cat/agent";

import { executeQuery, getDbHandle, listNeighborElements } from "@cat/domain";
import * as z from "zod/v4";

import { assertElementInSession } from "./assert-session-scope.ts";

const getNeighborsArgs = z.object({
  elementId: z
    .int()
    .positive()
    .describe("Translatable element ID to get neighbors for"),
  windowSize: z
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe("Number of neighbor elements before and after"),
});

export const getNeighborsTool: AgentToolDefinition = {
  name: "get_neighbors",
  description:
    "Get neighboring elements around a specific translatable element, sorted by document order. Returns source text and approved translation (if any) for each neighbor. Use this to understand the context before translating an element.",
  parameters: getNeighborsArgs,
  sideEffectType: "none",
  toolSecurityLevel: "standard",
  async execute(args, ctx) {
    const parsed = getNeighborsArgs.parse(args);
    await assertElementInSession(parsed.elementId, ctx);
    const { client: db } = await getDbHandle();
    const neighbors = await executeQuery({ db }, listNeighborElements, {
      elementId: parsed.elementId,
      windowSize: parsed.windowSize,
    });

    return {
      neighbors: neighbors.map((neighbor) => ({
        id: neighbor.id,
        sourceText: neighbor.value,
        languageId: neighbor.languageId,
        approvedTranslation: neighbor.approvedTranslation,
        approvedTranslationLanguageId: neighbor.approvedTranslationLanguageId,
        offset: neighbor.offset,
      })),
    };
  },
};
