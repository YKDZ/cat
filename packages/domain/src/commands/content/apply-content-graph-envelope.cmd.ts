import { and, contentNode, contentRelationType, eq } from "@cat/db";
import {
  CoreRelationTypeDefinitions,
  type RegisteredRelationTypeInput,
  type StructuredContentPayload,
} from "@cat/shared";

import type { Command } from "@/types";

export type ApplyContentGraphEnvelopeInput = {
  payload: StructuredContentPayload;
};

export type AppliedGraphEnvelope = {
  contentNodeIds: string[];
  relationTypeIdsByKey: Map<string, number>;
  contentNodeIdByRef: Map<string, string>;
  stableSourceNodeRefByRef: Map<string, string>;
};

/**
 * @zh 持久化结构化内容图的关系类型和节点。
 *
 * 合并 CoreRelationTypeDefinitions 和 payload.relationTypes，按
 * (namespace, name, version) upsert 所有关系类型。
 * 按 (projectId, importerId, sourceRootRef, stableSourceNodeRef) upsert 所有节点。
 * 返回节点引用映射，供后续 diff 使用。
 *
 * @en Persist relation types and nodes for a structured content graph payload.
 *
 * Merges CoreRelationTypeDefinitions with payload.relationTypes and upserts
 * all relation types by (namespace, name, version). Upserts nodes by
 * (projectId, importerId, sourceRootRef, stableSourceNodeRef). Returns
 * node ref maps for subsequent diffing.
 */
export const applyContentGraphEnvelope: Command<
  ApplyContentGraphEnvelopeInput,
  AppliedGraphEnvelope
> = async (ctx, command) => {
  const { payload } = command;

  // 1. Merge and deduplicate relation types
  const allRelationTypes: RegisteredRelationTypeInput[] = [
    ...CoreRelationTypeDefinitions,
    ...payload.relationTypes,
  ];
  const rtByKey = new Map<string, RegisteredRelationTypeInput>();
  for (const rt of allRelationTypes) {
    rtByKey.set(`${rt.namespace}:${rt.name}:${rt.version}`, rt);
  }

  const relationTypeIdsByKey = new Map<string, number>();
  for (const [key, rt] of rtByKey) {
    // oxlint-disable-next-line no-await-in-loop
    const existing = await ctx.db
      .select({ id: contentRelationType.id })
      .from(contentRelationType)
      .where(
        and(
          eq(contentRelationType.namespace, rt.namespace),
          eq(contentRelationType.name, rt.name),
          eq(contentRelationType.version, rt.version),
        ),
      )
      .limit(1);

    if (existing[0]) {
      relationTypeIdsByKey.set(key, existing[0].id);
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const rows = await ctx.db
      .insert(contentRelationType)
      .values({
        namespace: rt.namespace,
        name: rt.name,
        version: rt.version,
        semanticFamily: rt.semanticFamily,
        allowedEndpointPairs: rt.allowedEndpointPairs,
        directionality: rt.directionality ?? "DIRECTED",
        participatesInContainment: rt.participatesInContainment ?? false,
        participatesInExport: rt.participatesInExport ?? false,
        supportsOrdering: rt.supportsOrdering ?? false,
        weightingEligible: rt.weightingEligible ?? false,
        defaultTrustLevel: rt.defaultTrustLevel ?? "COLLECTED",
        metadata: rt.metadata ?? null,
      })
      .onConflictDoUpdate({
        target: [
          contentRelationType.namespace,
          contentRelationType.name,
          contentRelationType.version,
        ],
        set: {
          semanticFamily: rt.semanticFamily,
          participatesInContainment: rt.participatesInContainment ?? false,
          participatesInExport: rt.participatesInExport ?? false,
          supportsOrdering: rt.supportsOrdering ?? false,
          weightingEligible: rt.weightingEligible ?? false,
        },
      })
      .returning({ id: contentRelationType.id });

    if (rows[0]) {
      relationTypeIdsByKey.set(key, rows[0].id);
    }
  }

  // 2. Upsert content nodes
  const contentNodeIdByRef = new Map<string, string>();
  const stableSourceNodeRefByRef = new Map<string, string>();

  for (const node of payload.nodes) {
    // oxlint-disable-next-line no-await-in-loop
    const rows = await ctx.db
      .insert(contentNode)
      .values({
        projectId: payload.projectId,
        kind: node.kind,
        displayLabel: node.displayLabel,
        importerId: payload.importerId,
        sourceRootRef: payload.sourceRootRef,
        stableSourceNodeRef: node.stableSourceNodeRef,
        sourceUri: node.sourceUri ?? null,
        sourcePath: node.sourcePath ?? null,
        sourceType: node.sourceType ?? null,
        languageId: node.languageId ?? null,
        exportRole: node.exportRole ?? "NONE",
        boundaryType: node.boundaryType ?? "NONE",
        fileId: node.file?.fileId ?? null,
        metadata: node.metadata ?? null,
        provenance: node.provenance ?? null,
      })
      .onConflictDoUpdate({
        target: [
          contentNode.projectId,
          contentNode.importerId,
          contentNode.sourceRootRef,
          contentNode.stableSourceNodeRef,
        ],
        set: {
          displayLabel: node.displayLabel,
          sourcePath: node.sourcePath ?? null,
          sourceType: node.sourceType ?? null,
          languageId: node.languageId ?? null,
          exportRole: node.exportRole ?? "NONE",
          boundaryType: node.boundaryType ?? "NONE",
          fileId: node.file?.fileId ?? null,
          metadata: node.metadata ?? null,
        },
      })
      .returning({ id: contentNode.id });

    if (rows[0]) {
      contentNodeIdByRef.set(node.ref, rows[0].id);
      stableSourceNodeRefByRef.set(node.ref, node.stableSourceNodeRef);
    }
  }

  return {
    result: {
      contentNodeIds: [...contentNodeIdByRef.values()],
      relationTypeIdsByKey,
      contentNodeIdByRef,
      stableSourceNodeRefByRef,
    },
    events: [],
  };
};
