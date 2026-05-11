// oxlint-disable no-await-in-loop
import type { OperationContext } from "@cat/domain";

import {
  applyContentGraphEnvelope,
  bulkUpdateElementsForDiff,
  createElements,
  deleteElementsByIds,
  executeCommand,
  executeQuery,
  getDbHandle,
  insertSemanticDiffEntry,
  listCachedVectorizedStrings,
  listElementsByImporterScope,
  persistContentGraphAttachments,
} from "@cat/domain";
import {
  StructuredContentPayloadSchema,
  type SemanticDiffEntryPayload,
  type StableElementIdentity,
} from "@cat/shared";
import * as z from "zod";

import { createVectorizedStringOp } from "./create-vectorized-string";

export const DiffStructuredContentInputSchema = z.object({
  payload: StructuredContentPayloadSchema,
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const DiffStructuredContentOutputSchema = z.object({
  contentNodeIds: z.array(z.uuidv4()),
  relationIds: z.array(z.uuidv4()),
  contextEvidenceIds: z.array(z.int()),
  addedElementIds: z.array(z.int()),
  removedElementIds: z.array(z.int()),
  updatedElementIds: z.array(z.int()),
  movedElementIds: z.array(z.int()),
  semanticDiffIds: z.array(z.int()),
});

export type DiffStructuredContentInput = z.infer<
  typeof DiffStructuredContentInputSchema
>;
export type DiffStructuredContentOutput = z.infer<
  typeof DiffStructuredContentOutputSchema
>;

// ─── Pure classification helper ───────────────────────────────────────────────

export type ClassifySemanticElementDiffInput = {
  oldText: string;
  newText: string;
  oldPrimaryContentNodeId: string | null | undefined;
  newPrimaryContentNodeId: string | null | undefined;
  oldLocalOrder: number | null | undefined;
  newLocalOrder: number | null | undefined;
  oldMeta: unknown;
  newMeta: unknown;
};

export type ClassifySemanticElementDiffResult = {
  diffKind:
    | "SOURCE_TEXT_UPDATE"
    | "REPARENT"
    | "MOVE"
    | "METADATA_ONLY"
    | "EVIDENCE_UPDATE";
  vectorInvalidationReason: "SOURCE_TEXT_CHANGED" | "NOT_REQUIRED";
};

/**
 * @zh 对单个元素匹配执行语义差分分类（纯函数，用于测试）。
 *
 * 规则：
 * - 文本改变 → SOURCE_TEXT_UPDATE / SOURCE_TEXT_CHANGED
 * - 节点改变 → REPARENT / NOT_REQUIRED
 * - 仅顺序改变 → MOVE / NOT_REQUIRED
 * - 其他 → METADATA_ONLY / NOT_REQUIRED
 *
 * @en Classify a single matched element pair semantically (pure function, testable).
 */
export const classifySemanticElementDiffForTest = (
  input: ClassifySemanticElementDiffInput,
): ClassifySemanticElementDiffResult => {
  const textChanged = input.oldText !== input.newText;
  const nodeChanged =
    (input.oldPrimaryContentNodeId ?? null) !==
    (input.newPrimaryContentNodeId ?? null);
  const orderChanged =
    (input.oldLocalOrder ?? null) !== (input.newLocalOrder ?? null);

  if (textChanged) {
    return {
      diffKind: "SOURCE_TEXT_UPDATE",
      vectorInvalidationReason: "SOURCE_TEXT_CHANGED",
    };
  }
  if (nodeChanged) {
    return {
      diffKind: "REPARENT",
      vectorInvalidationReason: "NOT_REQUIRED",
    };
  }
  if (orderChanged) {
    return {
      diffKind: "MOVE",
      vectorInvalidationReason: "NOT_REQUIRED",
    };
  }
  return {
    diffKind: "METADATA_ONLY",
    vectorInvalidationReason: "NOT_REQUIRED",
  };
};

// ─── Main diff operation ──────────────────────────────────────────────────────

/**
 * @zh 通过结构化内容载荷对元素执行稳定身份差分，并记录语义差分条目。
 *
 * 1. 持久化图结构（关系类型、节点）
 * 2. 加载现有元素（按 importerId + sourceRootRef 匹配）
 * 3. 通过稳定身份四元组（importerId + sourceRootRef + sourceNodeRef + stableSourceRef）匹配
 * 4. 对匹配元素分类（文本更新、移动、重挂载、仅元数据）
 * 5. 创建新增元素，软删除移除的元素
 * 6. 记录 SemanticDiffEntry
 * 7. 持久化图附件（关系、证据）
 *
 * @en Diff elements by stable identity from a structured content payload
 * and record semantic diff entries.
 */
export const diffStructuredContentOp = async (
  data: DiffStructuredContentInput,
  ctx?: OperationContext,
): Promise<DiffStructuredContentOutput> => {
  const { client: drizzle } = await getDbHandle();

  // 1. Persist graph envelope (relation types + nodes)
  const envelope = await executeCommand(
    { db: drizzle },
    applyContentGraphEnvelope,
    { payload: data.payload },
  );

  const semanticDiffIds: number[] = [];

  const recordSemanticDiff = async (
    entry: SemanticDiffEntryPayload & {
      elementId?: number | null;
      contentNodeId?: string | null;
      contentRelationId?: string | null;
    },
  ) => {
    const result = await executeCommand(
      { db: drizzle },
      insertSemanticDiffEntry,
      { projectId: data.payload.projectId, entry },
    );
    semanticDiffIds.push(result.id);
  };

  // 2. Load existing elements for this importer scope
  const existingElements = await executeQuery(
    { db: drizzle },
    listElementsByImporterScope,
    {
      projectId: data.payload.projectId,
      importerId: data.payload.importerId,
      sourceRootRef: data.payload.sourceRootRef,
    },
  );

  const identityKey = (item: {
    importerId: string | null;
    sourceRootRef: string | null;
    sourceNodeRef: string | null;
    stableSourceRef: string | null;
  }): string =>
    `${item.importerId ?? ""}\u0000${item.sourceRootRef ?? ""}\u0000${item.sourceNodeRef ?? ""}\u0000${item.stableSourceRef ?? ""}`;

  const oldByIdentity = new Map(
    existingElements.map((row) => [identityKey(row), row]),
  );

  // 3. Build new identity map from payload
  const newByIdentity = new Map<
    string,
    (typeof data.payload.elements)[number]
  >();
  for (const element of data.payload.elements) {
    const stableSourceNodeRef = envelope.stableSourceNodeRefByRef.get(
      element.sourceNodeRef,
    );
    if (!stableSourceNodeRef) {
      const identity: StableElementIdentity = {
        importerId: data.payload.importerId,
        sourceRootRef: data.payload.sourceRootRef,
        sourceNodeRef: element.sourceNodeRef,
        stableSourceRef: element.stableSourceRef,
      };
      await recordSemanticDiff({
        diffKind: "IDENTITY_CONFLICT",
        vectorInvalidationReason: "IDENTITY_CONFLICT",
        oldIdentity: null,
        newIdentity: identity,
        oldText: null,
        newText: element.text,
        preservationPolicy: {
          action: "quarantine",
          reason: "missing content node",
          ref: element.ref,
        },
      });
      continue;
    }
    const key = `${data.payload.importerId}\u0000${data.payload.sourceRootRef}\u0000${stableSourceNodeRef}\u0000${element.stableSourceRef}`;
    if (newByIdentity.has(key)) {
      await recordSemanticDiff({
        diffKind: "IDENTITY_CONFLICT",
        vectorInvalidationReason: "IDENTITY_CONFLICT",
        oldIdentity: null,
        newIdentity: {
          importerId: data.payload.importerId,
          sourceRootRef: data.payload.sourceRootRef,
          sourceNodeRef: stableSourceNodeRef,
          stableSourceRef: element.stableSourceRef,
        },
        oldText: null,
        newText: element.text,
        preservationPolicy: {
          action: "quarantine",
          reason: "duplicate stable identity in payload",
          ref: element.ref,
        },
      });
      continue;
    }
    newByIdentity.set(key, element);
  }

  // 4. Classify matches
  const addedElements: (typeof data.payload.elements)[number][] = [];
  const removedElementIds: number[] = [];
  const updatedElementIds: number[] = [];
  const movedElementIds: number[] = [];
  const elementIdByRef = new Map<string, number>();

  for (const [key, newEl] of newByIdentity) {
    const old = oldByIdentity.get(key);
    if (!old) {
      addedElements.push(newEl);
    } else {
      elementIdByRef.set(newEl.ref, old.id);
      const stableSourceNodeRef = envelope.stableSourceNodeRefByRef.get(
        newEl.sourceNodeRef,
      );
      const newContentNodeId = stableSourceNodeRef
        ? (envelope.contentNodeIdByRef.get(newEl.sourceNodeRef) ?? null)
        : null;

      const classification = classifySemanticElementDiffForTest({
        oldText: old.value,
        newText: newEl.text,
        oldPrimaryContentNodeId: old.primaryContentNodeId,
        newPrimaryContentNodeId: newContentNodeId,
        oldLocalOrder: old.localOrder,
        newLocalOrder: newEl.localOrder ?? null,
        oldMeta: null,
        newMeta: newEl.meta,
      });

      const oldIdentity: StableElementIdentity = {
        importerId: data.payload.importerId,
        sourceRootRef: data.payload.sourceRootRef,
        sourceNodeRef: old.sourceNodeRef ?? "",
        stableSourceRef: old.stableSourceRef ?? "",
      };
      const newIdentity: StableElementIdentity = {
        importerId: data.payload.importerId,
        sourceRootRef: data.payload.sourceRootRef,
        sourceNodeRef: stableSourceNodeRef ?? newEl.sourceNodeRef,
        stableSourceRef: newEl.stableSourceRef,
      };

      await recordSemanticDiff({
        ...classification,
        elementId: old.id,
        oldIdentity,
        newIdentity,
        oldText: old.value,
        newText: newEl.text,
        preservationPolicy: null,
      });

      if (classification.diffKind === "SOURCE_TEXT_UPDATE") {
        const stringResult = await createVectorizedStringOp(
          {
            data: [{ text: newEl.text, languageId: newEl.languageId }],
            vectorizerId: data.vectorizerId,
            vectorStorageId: data.vectorStorageId,
          },
          ctx,
        );
        const stringId = stringResult.stringIds[0];
        if (stringId !== undefined) {
          await executeCommand({ db: drizzle }, bulkUpdateElementsForDiff, {
            stringIdUpdates: [{ id: old.id, stringId }],
          });
        }
        updatedElementIds.push(old.id);
      } else if (
        classification.diffKind === "MOVE" ||
        classification.diffKind === "REPARENT"
      ) {
        movedElementIds.push(old.id);
      }
    }
  }

  for (const [key, old] of oldByIdentity) {
    if (!newByIdentity.has(key)) {
      removedElementIds.push(old.id);
      const oldIdentity: StableElementIdentity = {
        importerId: data.payload.importerId,
        sourceRootRef: data.payload.sourceRootRef,
        sourceNodeRef: old.sourceNodeRef ?? "",
        stableSourceRef: old.stableSourceRef ?? "",
      };
      await recordSemanticDiff({
        diffKind: "DELETE",
        vectorInvalidationReason: "NOT_REQUIRED",
        elementId: old.id,
        oldIdentity,
        newIdentity: null,
        oldText: old.value,
        newText: null,
        preservationPolicy: null,
      });
    }
  }

  // 5. Create new elements
  const addedIds: number[] = [];
  if (addedElements.length > 0) {
    const cachedStrings = await executeQuery(
      { db: drizzle },
      listCachedVectorizedStrings,
      {
        items: addedElements.map((el) => ({
          text: el.text,
          languageId: el.languageId,
        })),
      },
    );
    const stringMap = new Map<string, number>();
    for (const str of cachedStrings) {
      stringMap.set(`${str.value}|${str.languageId}`, str.id);
    }

    const withCache: ((typeof addedElements)[number] & {
      stringId: number;
    })[] = [];
    const withoutCache: (typeof addedElements)[number][] = [];

    for (const el of addedElements) {
      const stringId = stringMap.get(`${el.text}|${el.languageId}`);
      if (stringId !== undefined) {
        withCache.push({ ...el, stringId });
      } else {
        withoutCache.push(el);
      }
    }

    const resolveContentNodeId = (
      el: (typeof addedElements)[number],
    ): string => {
      const nodeId = envelope.contentNodeIdByRef.get(el.sourceNodeRef);
      if (!nodeId) {
        throw new Error(`No content node found for element ref ${el.ref}`);
      }
      return nodeId;
    };

    const resolveStableNodeRef = (
      el: (typeof addedElements)[number],
    ): string => {
      return (
        envelope.stableSourceNodeRefByRef.get(el.sourceNodeRef) ??
        el.sourceNodeRef
      );
    };

    if (withCache.length > 0) {
      const insertedIds = await executeCommand(
        { db: drizzle },
        createElements,
        {
          data: withCache.map((el) => ({
            projectId: data.payload.projectId,
            primaryContentNodeId: resolveContentNodeId(el),
            importerId: data.payload.importerId,
            sourceRootRef: data.payload.sourceRootRef,
            sourceNodeRef: resolveStableNodeRef(el),
            stableSourceRef: el.stableSourceRef,
            stringId: el.stringId,
            localOrder: el.localOrder ?? 0,
            meta: el.meta ?? {},
            sourceStartLine: el.location?.startLine ?? null,
            sourceEndLine: el.location?.endLine ?? null,
            sourceLocationMeta: el.location?.custom ?? null,
          })),
        },
      );
      addedIds.push(...insertedIds);
      for (let i = 0; i < withCache.length; i += 1) {
        const el = withCache[i];
        const id = insertedIds[i];
        if (el && id !== undefined) {
          elementIdByRef.set(el.ref, id);
          await recordSemanticDiff({
            diffKind: "CREATE",
            vectorInvalidationReason: "NEW_SOURCE_TEXT",
            elementId: id,
            oldIdentity: null,
            newIdentity: {
              importerId: data.payload.importerId,
              sourceRootRef: data.payload.sourceRootRef,
              sourceNodeRef: resolveStableNodeRef(el),
              stableSourceRef: el.stableSourceRef,
            },
            oldText: null,
            newText: el.text,
            preservationPolicy: null,
          });
        }
      }
    }

    if (withoutCache.length > 0) {
      const stringResult = await createVectorizedStringOp(
        {
          data: withoutCache.map((el) => ({
            text: el.text,
            languageId: el.languageId,
          })),
          vectorizerId: data.vectorizerId,
          vectorStorageId: data.vectorStorageId,
        },
        ctx,
      );

      const insertedIds = await executeCommand(
        { db: drizzle },
        createElements,
        {
          data: withoutCache.map((el, idx) => {
            const stringId = stringResult.stringIds[idx];
            if (stringId === undefined) {
              throw new Error(`Missing string ID for element at index ${idx}`);
            }
            return {
              projectId: data.payload.projectId,
              primaryContentNodeId: resolveContentNodeId(el),
              importerId: data.payload.importerId,
              sourceRootRef: data.payload.sourceRootRef,
              sourceNodeRef: resolveStableNodeRef(el),
              stableSourceRef: el.stableSourceRef,
              stringId,
              localOrder: el.localOrder ?? 0,
              meta: el.meta ?? {},
              sourceStartLine: el.location?.startLine ?? null,
              sourceEndLine: el.location?.endLine ?? null,
              sourceLocationMeta: el.location?.custom ?? null,
            };
          }),
        },
      );
      addedIds.push(...insertedIds);
      for (let i = 0; i < withoutCache.length; i += 1) {
        const el = withoutCache[i];
        const id = insertedIds[i];
        if (el && id !== undefined) {
          elementIdByRef.set(el.ref, id);
          await recordSemanticDiff({
            diffKind: "CREATE",
            vectorInvalidationReason: "NEW_SOURCE_TEXT",
            elementId: id,
            oldIdentity: null,
            newIdentity: {
              importerId: data.payload.importerId,
              sourceRootRef: data.payload.sourceRootRef,
              sourceNodeRef: resolveStableNodeRef(el),
              stableSourceRef: el.stableSourceRef,
            },
            oldText: null,
            newText: el.text,
            preservationPolicy: null,
          });
        }
      }
    }
  }

  // 6. Soft-delete removed elements
  if (removedElementIds.length > 0) {
    await executeCommand({ db: drizzle }, deleteElementsByIds, {
      elementIds: removedElementIds,
    });
  }

  // 7. Persist graph attachments (relations + evidence)
  const attachments = await executeCommand(
    { db: drizzle },
    persistContentGraphAttachments,
    {
      payload: data.payload,
      envelope,
      elementIdByRef,
    },
  );

  return {
    contentNodeIds: envelope.contentNodeIds,
    relationIds: attachments.relationIds,
    contextEvidenceIds: attachments.contextEvidenceIds,
    addedElementIds: addedIds,
    removedElementIds,
    updatedElementIds,
    movedElementIds,
    semanticDiffIds,
  };
};
