import type { FlattenedContextEvidence } from "@cat/shared";

import {
  and,
  asc,
  contentRelation,
  contextEvidence,
  eq,
  getColumns,
  lte,
  sql,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import { getEffectiveContextProfile } from "./get-effective-context-profile.query";

export const AssembleContextEvidenceQuerySchema = z.object({
  elementId: z.int(),
  purpose: z.enum(["EDITOR", "RECALL", "QA", "AI", "AGENT"]),
  profileId: z.uuidv4().optional(),
  maxItems: z.int().min(1).optional(),
  maxTokens: z.int().min(1).optional(),
  includeExpansion: z.boolean().default(false),
});
export type AssembleContextEvidenceQuery = z.input<
  typeof AssembleContextEvidenceQuerySchema
>;

const estimateTokens = (value: unknown): number => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil((text?.length ?? 0) / 4);
};

export const assembleContextEvidence: Query<
  AssembleContextEvidenceQuery,
  FlattenedContextEvidence[]
> = async (ctx, query) => {
  const refRows = await ctx.db
    .select({
      elementId: translatableElement.id,
      projectId: translatableElement.projectId,
      sourceText: vectorizedString.value,
      languageId: vectorizedString.languageId,
      primaryContentNodeId: contentRelation.sourceNodeId,
      localOrder: contentRelation.localOrder,
      stableSourceRef: translatableElement.stableSourceRef,
      meta: translatableElement.meta,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .leftJoin(
      contentRelation,
      and(
        eq(contentRelation.targetElementId, translatableElement.id),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .where(eq(translatableElement.id, query.elementId))
    .limit(1);

  const ref = refRows[0];
  if (!ref) return [];

  const profile = await getEffectiveContextProfile(ctx, {
    projectId: ref.projectId,
    profileId: query.profileId,
  });
  const budget = profile.payload.consumerBudgets[query.purpose];
  const maxItems = query.maxItems ?? budget?.maxItems ?? 20;
  const maxTokens =
    query.maxTokens ?? budget?.maxTokens ?? Number.POSITIVE_INFINITY;

  const directEvidence = await ctx.db
    .select({ ...getColumns(contextEvidence) })
    .from(contextEvidence)
    .where(eq(contextEvidence.translatableElementId, query.elementId))
    .orderBy(asc(contextEvidence.id))
    .limit(maxItems);

  const neighborRows = ref.primaryContentNodeId
    ? await ctx.db
        .select({
          elementId: translatableElement.id,
          stableSourceRef: translatableElement.stableSourceRef,
          value: vectorizedString.value,
          languageId: vectorizedString.languageId,
          localOrder: contentRelation.localOrder,
          relationId: contentRelation.id,
        })
        .from(contentRelation)
        .innerJoin(
          translatableElement,
          eq(contentRelation.targetElementId, translatableElement.id),
        )
        .innerJoin(
          vectorizedString,
          eq(translatableElement.vectorizedStringId, vectorizedString.id),
        )
        .where(
          and(
            eq(contentRelation.sourceNodeId, ref.primaryContentNodeId),
            eq(contentRelation.isPrimary, true),
            lte(contentRelation.localOrder, (ref.localOrder ?? 0) + maxItems),
          ),
        )
        .orderBy(
          asc(sql`ABS(${contentRelation.localOrder} - ${ref.localOrder ?? 0})`),
          asc(contentRelation.localOrder),
          asc(translatableElement.id),
        )
        .limit(maxItems + 1)
    : [];

  const elementKeyPayload: Record<string, unknown> = {
    "stable ref": ref.stableSourceRef,
  };
  if (ref.meta && typeof ref.meta === "object" && !Array.isArray(ref.meta)) {
    Object.assign(elementKeyPayload, ref.meta);
  }

  const candidates: FlattenedContextEvidence[] = [
    {
      purpose: query.purpose,
      priority: 0,
      label: "element key",
      score: 100,
      sourceEndpoint: `element:${query.elementId}`,
      relatedEndpoint: null,
      trustLevel: "VERIFIED",
      freshness: null,
      clipped: false,
      payload: { kind: "JSON", json: elementKeyPayload },
      expansion: null,
    },
    // Source text is omitted for EDITOR purpose: the editor already displays
    // the element's own source text, so including it here would be redundant.
    ...(query.purpose !== "EDITOR"
      ? [
          {
            purpose: query.purpose,
            priority: 1,
            label: "source text",
            score: 100,
            sourceEndpoint: `element:${query.elementId}`,
            relatedEndpoint: null,
            trustLevel: "VERIFIED" as const,
            freshness: null,
            clipped: false,
            payload: { text: ref.sourceText, languageId: ref.languageId },
            expansion: null,
          },
        ]
      : []),
    ...directEvidence.map((evidence, index) => ({
      purpose: query.purpose,
      priority: 10 + index,
      label: evidence.displayLabel ?? evidence.kind.toLowerCase(),
      score: 80,
      sourceEndpoint: `element:${query.elementId}`,
      relatedEndpoint: evidence.contentNodeId
        ? `node:${evidence.contentNodeId}`
        : evidence.contentRelationId
          ? `relation:${evidence.contentRelationId}`
          : null,
      trustLevel: evidence.trustLevel,
      freshness: evidence.freshnessAt?.toISOString() ?? null,
      clipped: false,
      payload: {
        kind: evidence.kind,
        text: evidence.textData,
        json: evidence.jsonData,
        fileId: evidence.fileId,
      },
      expansion:
        (query.includeExpansion ?? false)
          ? {
              relationIds: evidence.contentRelationId
                ? [evidence.contentRelationId]
                : [],
              evidenceIds: [evidence.id],
              explanation: "direct evidence attached to element",
            }
          : null,
    })),
    ...neighborRows
      .filter((row) => row.elementId !== query.elementId)
      .map((row, index) => ({
        purpose: query.purpose,
        priority: 40 + index,
        label: "local sequence neighbor",
        score: Math.max(1, 50 - index),
        sourceEndpoint: `element:${query.elementId}`,
        relatedEndpoint: `element:${row.elementId}`,
        trustLevel: "COLLECTED" as const,
        freshness: null,
        clipped: false,
        payload: {
          text: row.value,
          languageId: row.languageId,
          localOrder: row.localOrder,
          stableSourceRef: row.stableSourceRef,
          elementId: row.elementId,
        },
        expansion:
          (query.includeExpansion ?? false)
            ? {
                relationIds: [row.relationId],
                evidenceIds: [],
                explanation: "same primary content node ordered neighbor",
              }
            : null,
      })),
  ];

  const bounded: FlattenedContextEvidence[] = [];
  let tokenCount = 0;
  for (const item of candidates.sort((a, b) => a.priority - b.priority)) {
    if (bounded.length >= maxItems) break;
    const nextTokens = estimateTokens(item.payload);
    if (tokenCount + nextTokens > maxTokens) {
      bounded.push({ ...item, clipped: true });
      break;
    }
    tokenCount += nextTokens;
    bounded.push(item);
  }
  return bounded;
};
