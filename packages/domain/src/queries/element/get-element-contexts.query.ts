import type { FlattenedContextEvidence } from "@cat/shared";

import * as z from "zod";

import type { Query } from "@/types";

import { assembleContextEvidence } from "@/queries/context/assemble-context-evidence.query";

export const GetElementContextsQuerySchema = z.object({
  elementId: z.int(),
  purpose: z.enum(["EDITOR", "RECALL", "QA", "AI", "AGENT"]).default("EDITOR"),
  maxItems: z.int().min(1).optional(),
});
export type GetElementContextsQuery = z.infer<
  typeof GetElementContextsQuerySchema
>;

export type GetElementContextsResult = {
  contexts: FlattenedContextEvidence[];
};

export const getElementContexts: Query<
  GetElementContextsQuery,
  GetElementContextsResult
> = async (ctx, query) => ({
  contexts: await assembleContextEvidence(ctx, {
    elementId: query.elementId,
    purpose: query.purpose,
    maxItems: query.maxItems,
  }),
});
