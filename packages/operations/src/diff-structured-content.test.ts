import type { StructuredContentPayload } from "@cat/shared";

import {
  createProject,
  createUser,
  ensureLanguages,
  executeCommand,
} from "@cat/domain";
import { setupTestDB, type TestDB } from "@cat/test-utils";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  and,
  contentNode,
  contentRelation,
  eq,
  translatableElement,
} from "../../db/dist/index.js";
import {
  classifySemanticElementDiffForTest,
  DiffStructuredContentInputSchema,
  diffStructuredContentOp,
} from "./diff-structured-content";

const BASE_DIFF_INPUT = {
  oldText: "Hello",
  newText: "Hello",
  oldPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
  newPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
  oldLocalOrder: 0,
  newLocalOrder: 0,
  oldMeta: {},
  newMeta: {},
  oldSourceStartLine: 1,
  newSourceStartLine: 1,
  oldSourceEndLine: 1,
  newSourceEndLine: 1,
  oldSourceLocationMeta: null,
  newSourceLocationMeta: null,
};

const buildPayload = (
  projectId: string,
  options: {
    elementRef: string;
    localOrder: number;
    startLine: number;
  },
): StructuredContentPayload => ({
  payloadVersion: "content-graph/v1",
  projectId,
  sourceLanguageId: "zh-Hans",
  importerId: "test-importer",
  sourceRootRef: "test-root",
  relationTypes: [],
  nodes: [
    {
      ref: "node:a",
      kind: "SOURCE_COMPONENT",
      displayLabel: "a.vue",
      importerId: "test-importer",
      sourceRootRef: "test-root",
      stableSourceNodeRef: "node:a",
      exportRole: "NONE",
      boundaryType: "FILE",
    },
    {
      ref: "node:b",
      kind: "SOURCE_COMPONENT",
      displayLabel: "b.vue",
      importerId: "test-importer",
      sourceRootRef: "test-root",
      stableSourceNodeRef: "node:b",
      exportRole: "NONE",
      boundaryType: "FILE",
    },
  ],
  elements: [
    {
      ref: options.elementRef,
      stableSourceRef: "stable:message",
      sourceNodeRef: "node:a",
      localOrder: options.localOrder,
      text: "同一文本",
      languageId: "zh-Hans",
      meta: { key: ["hello"] },
      location: {
        startLine: options.startLine,
        endLine: options.startLine,
      },
    },
  ],
  relations: [],
  evidence: [],
});

describe("semantic structured content diff", () => {
  it("preserves vectorization for move-only changes", () => {
    const diff = classifySemanticElementDiffForTest({
      ...BASE_DIFF_INPUT,
      newPrimaryContentNodeId: "00000000-0000-4000-8000-000000000002",
      newLocalOrder: 5,
      oldMeta: { key: ["hello"] },
      newMeta: { key: ["hello"] },
    });
    expect(diff).not.toBeNull();
    if (!diff) {
      throw new Error("Expected a semantic diff for reparent changes");
    }
    expect(diff.diffKind).toBe("REPARENT");
    expect(diff.vectorInvalidationReason).toBe("NOT_REQUIRED");
  });

  it("invalidates vectors only when source text changes", () => {
    const diff = classifySemanticElementDiffForTest({
      ...BASE_DIFF_INPUT,
      newText: "Hello world",
      oldMeta: { key: ["hello"] },
      newMeta: { key: ["hello"] },
    });
    expect(diff).not.toBeNull();
    if (!diff) {
      throw new Error("Expected a semantic diff for source text changes");
    }
    expect(diff.diffKind).toBe("SOURCE_TEXT_UPDATE");
    expect(diff.vectorInvalidationReason).toBe("SOURCE_TEXT_CHANGED");
  });

  it("classifies order-only changes as MOVE with no vector invalidation", () => {
    const diff = classifySemanticElementDiffForTest({
      ...BASE_DIFF_INPUT,
      oldText: "Same text",
      newText: "Same text",
      newLocalOrder: 3,
    });
    expect(diff).not.toBeNull();
    if (!diff) {
      throw new Error("Expected a semantic diff for move changes");
    }
    expect(diff.diffKind).toBe("MOVE");
    expect(diff.vectorInvalidationReason).toBe("NOT_REQUIRED");
  });

  it("classifies metadata-only changes with no vector invalidation", () => {
    const diff = classifySemanticElementDiffForTest({
      ...BASE_DIFF_INPUT,
      oldMeta: { key: ["a"] },
      newMeta: { key: ["b"] },
    });
    expect(diff).not.toBeNull();
    if (!diff) {
      throw new Error("Expected a semantic diff for metadata-only changes");
    }
    expect(diff.diffKind).toBe("METADATA_ONLY");
    expect(diff.vectorInvalidationReason).toBe("NOT_REQUIRED");
  });

  it("allows diff input without vector service IDs", () => {
    const parsed = DiffStructuredContentInputSchema.parse({
      payload: {
        payloadVersion: "content-graph/v1",
        projectId: "00000000-0000-4000-8000-000000000001",
        sourceLanguageId: "zh-Hans",
        importerId: "test",
        sourceRootRef: "root",
        nodes: [
          {
            ref: "node",
            kind: "SOURCE_COMPONENT",
            displayLabel: "node",
            importerId: "test",
            sourceRootRef: "root",
            stableSourceNodeRef: "node",
            exportRole: "NONE",
            boundaryType: "FILE",
          },
        ],
        elements: [],
        relations: [],
        evidence: [],
        relationTypes: [],
      },
    });

    expect(parsed.vectorizerId).toBeUndefined();
  });

  it("classifies source location changes as evidence updates", () => {
    const diff = classifySemanticElementDiffForTest({
      ...BASE_DIFF_INPUT,
      oldText: "同一文本",
      newText: "同一文本",
      newSourceStartLine: 4,
      newSourceEndLine: 4,
    });

    expect(diff).not.toBeNull();
    expect(diff?.diffKind).toBe("EVIDENCE_UPDATE");
    expect(diff?.vectorInvalidationReason).toBe("NOT_REQUIRED");
  });

  it("returns no semantic diff for identical matched elements", () => {
    const diff = classifySemanticElementDiffForTest({
      ...BASE_DIFF_INPUT,
      oldText: "同一文本",
      newText: "同一文本",
    });

    expect(diff).toBeNull();
  });
});

describe("diffStructuredContentOp integration", () => {
  let db: TestDB;
  let creatorId: string;

  beforeAll(async () => {
    db = await setupTestDB();
    await executeCommand({ db: db.client }, ensureLanguages, {
      languageIds: ["zh-Hans"],
    });
    const user = await executeCommand({ db: db.client }, createUser, {
      email: `diff-structured-${randomUUID()}@example.com`,
      name: "Diff Structured Tester",
    });
    creatorId = user.id;
  });

  afterAll(async () => {
    await db.cleanup();
  });

  it("updates primary relations and source locations while preserving element ids", async () => {
    const project = await executeCommand({ db: db.client }, createProject, {
      name: `diff-structured-${randomUUID()}`,
      description: null,
      creatorId,
    });
    const initialPayload = buildPayload(project.id, {
      elementRef: "element:initial",
      localOrder: 0,
      startLine: 1,
    });

    const first = await diffStructuredContentOp({ payload: initialPayload });
    const elementId = first.elementIdsByRef["element:initial"];
    expect(typeof elementId).toBe("number");

    const nodes = await db.client
      .select({
        id: contentNode.id,
        stableSourceNodeRef: contentNode.stableSourceNodeRef,
      })
      .from(contentNode)
      .where(
        and(
          eq(contentNode.projectId, project.id),
          eq(contentNode.importerId, initialPayload.importerId),
          eq(contentNode.sourceRootRef, initialPayload.sourceRootRef),
        ),
      );
    const nodeA = nodes.find((node) => node.stableSourceNodeRef === "node:a");
    const nodeB = nodes.find((node) => node.stableSourceNodeRef === "node:b");

    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();

    await db.client
      .update(contentRelation)
      .set({
        sourceNodeId: nodeB!.id,
        localOrder: 5,
      })
      .where(
        and(
          eq(contentRelation.targetEndpointKind, "ELEMENT"),
          eq(contentRelation.targetElementId, elementId),
          eq(contentRelation.isPrimary, true),
        ),
      );

    const rerunPayload = buildPayload(project.id, {
      elementRef: "element:rerun",
      localOrder: 1,
      startLine: 4,
    });

    const second = await diffStructuredContentOp({ payload: rerunPayload });

    expect(second.addedElementIds).toHaveLength(0);
    expect(second.removedElementIds).toHaveLength(0);
    expect(second.updatedElementIds).toHaveLength(0);
    expect(second.elementIdsByRef["element:rerun"]).toBe(elementId);
    expect(second.movedElementIds).toEqual([elementId]);

    const [primaryRelation] = await db.client
      .select({
        sourceNodeId: contentRelation.sourceNodeId,
        localOrder: contentRelation.localOrder,
      })
      .from(contentRelation)
      .where(
        and(
          eq(contentRelation.targetEndpointKind, "ELEMENT"),
          eq(contentRelation.targetElementId, elementId),
          eq(contentRelation.isPrimary, true),
        ),
      );

    expect(primaryRelation?.sourceNodeId).toBe(nodeA?.id);
    expect(primaryRelation?.localOrder).toBe(1);

    const [elementRow] = await db.client
      .select({
        sourceStartLine: translatableElement.sourceStartLine,
        sourceEndLine: translatableElement.sourceEndLine,
      })
      .from(translatableElement)
      .where(eq(translatableElement.id, elementId));

    expect(elementRow?.sourceStartLine).toBe(4);
    expect(elementRow?.sourceEndLine).toBe(4);
  });
});
