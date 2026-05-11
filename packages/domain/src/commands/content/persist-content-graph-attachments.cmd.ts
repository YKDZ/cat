import type { StructuredContentPayload } from "@cat/shared";

import { contentRelation, contextEvidence } from "@cat/db";

import type { Command } from "@/types";

import type { AppliedGraphEnvelope } from "./apply-content-graph-envelope.cmd";

export type PersistContentGraphAttachmentsInput = {
  payload: StructuredContentPayload;
  envelope: AppliedGraphEnvelope;
  elementIdByRef: Map<string, number>;
};

export type PersistContentGraphAttachmentsOutput = {
  relationIds: string[];
  contextEvidenceIds: number[];
};

/**
 * @zh 持久化结构化内容图中的关系和上下文证据。
 *
 * 在 diff 创建/更新元素后，将 payload.relations 和 payload.evidence
 * 解析为数据库行并持久化。
 *
 * @en Persist relations and context evidence from a structured content graph payload.
 *
 * After element diff creates/updates elements, resolves payload.relations
 * and payload.evidence endpoint refs to database IDs and persists them.
 */
export const persistContentGraphAttachments: Command<
  PersistContentGraphAttachmentsInput,
  PersistContentGraphAttachmentsOutput
> = async (ctx, command) => {
  const { payload, envelope, elementIdByRef } = command;

  const relationIds: string[] = [];
  const contextEvidenceIds: number[] = [];

  // Persist content relations
  for (const rel of payload.relations) {
    const relTypeKey = `${rel.type.namespace}:${rel.type.name}:${rel.type.version ?? "1.0.0"}`;
    const relationTypeId = envelope.relationTypeIdsByKey.get(relTypeKey);
    if (!relationTypeId) continue;

    const source = rel.source;
    const target = rel.target;

    let sourceNodeId: string | null = null;
    let sourceElementId: number | null = null;
    let targetNodeId: string | null = null;
    let targetElementId: number | null = null;

    if (source.kind === "NODE") {
      sourceNodeId = envelope.contentNodeIdByRef.get(source.nodeRef) ?? null;
      if (!sourceNodeId) continue;
    } else {
      sourceElementId = elementIdByRef.get(source.elementRef) ?? null;
      if (!sourceElementId) continue;
    }

    if (target.kind === "NODE") {
      targetNodeId = envelope.contentNodeIdByRef.get(target.nodeRef) ?? null;
      if (!targetNodeId) continue;
    } else {
      targetElementId = elementIdByRef.get(target.elementRef) ?? null;
      if (!targetElementId) continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const rows = await ctx.db
      .insert(contentRelation)
      .values({
        projectId: payload.projectId,
        relationTypeId,
        sourceEndpointKind: source.kind,
        sourceNodeId,
        sourceElementId,
        targetEndpointKind: target.kind,
        targetNodeId,
        targetElementId,
        isPrimary: rel.isPrimary ?? false,
        localOrder: rel.localOrder ?? null,
        confidenceBasisPoints: rel.confidenceBasisPoints ?? 10000,
        provenance: rel.provenance ?? null,
        validationMetadata: rel.metadata ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: contentRelation.id });

    if (rows[0]) {
      relationIds.push(rows[0].id);
    }
  }

  // Persist context evidence
  for (const ev of payload.evidence) {
    const attachedTo = ev.attachedTo;

    let attachedEndpointKind: string;
    let contentNodeId: string | null = null;
    let translatableElementId: number | null = null;
    let contentRelationId: string | null = null;

    if (attachedTo.kind === "NODE") {
      attachedEndpointKind = "NODE";
      contentNodeId =
        envelope.contentNodeIdByRef.get(attachedTo.nodeRef) ?? null;
      if (!contentNodeId) continue;
    } else if (attachedTo.kind === "ELEMENT") {
      attachedEndpointKind = "ELEMENT";
      translatableElementId = elementIdByRef.get(attachedTo.elementRef) ?? null;
      if (!translatableElementId) continue;
    } else {
      // RELATION endpoint refs are not tracked in the current output
      attachedEndpointKind = "RELATION";
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop
    const rows = await ctx.db
      .insert(contextEvidence)
      .values({
        projectId: payload.projectId,
        attachedEndpointKind,
        contentNodeId,
        translatableElementId,
        contentRelationId,
        kind: ev.kind,
        textData: ev.textData ?? null,
        jsonData: ev.jsonData ?? null,
        fileId: ev.fileId ?? null,
        storageProviderId: ev.storageProviderId ?? null,
        displayLabel: ev.displayLabel ?? null,
        trustLevel: ev.trustLevel ?? "COLLECTED",
        freshnessAt: ev.freshness ? new Date(ev.freshness) : null,
        provenance: ev.provenance ?? null,
      })
      .returning({ id: contextEvidence.id });

    if (rows[0]) {
      contextEvidenceIds.push(rows[0].id);
    }
  }

  return {
    result: { relationIds, contextEvidenceIds },
    events: [],
  };
};
