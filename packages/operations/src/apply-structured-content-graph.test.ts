import type { StructuredContentPayload } from "@cat/shared";

import { describe, expect, it } from "vitest";

import {
  applyStructuredContentGraphEnvelope,
  persistStructuredContentGraphAttachments,
} from "./apply-structured-content-graph";

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const NODE_ID = "00000000-0000-4000-8000-000000000010";

/**
 * Retrieves the Drizzle table name at runtime via its Symbol(drizzle:Name) key.
 * Drizzle does not expose a stable `._?.name` property at runtime.
 */
const getDrizzleTableName = (table: unknown): string => {
  if (!table || typeof table !== "object") return "unknown";
  const sym = Object.getOwnPropertySymbols(table).find(
    (s) => s.toString() === "Symbol(drizzle:Name)",
  );
  if (!sym) return "unknown";
  // oxlint-disable-next-line no-unsafe-type-assertion
  const val = (table as Record<symbol, unknown>)[sym];
  return typeof val === "string" ? val : "unknown";
};

/**
 * Creates a chainable mock Drizzle DB for capturing insert calls.
 * Each insert returns a `returning()` stub with known IDs, routed by table name.
 */
const makeMockDb = (options: {
  relTypeId?: number;
  contentNodeId?: string;
  relationId?: string;
  evidenceId?: number;
}) => {
  const {
    relTypeId = 1,
    contentNodeId = NODE_ID,
    relationId = "00000000-0000-4000-8000-000000000020",
    evidenceId = 100,
  } = options;

  const inserted: {
    table: string;
    values: unknown;
  }[] = [];

  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: async () => [],
  };
  const db = {
    select: (_shape: unknown) => selectChain,
    insert: (table: unknown) => {
      // Capture table name at insert time so returning() can route correctly.
      const tableName = getDrizzleTableName(table);
      return {
        values: (vals: unknown) => {
          inserted.push({ table: tableName, values: vals });
          return {
            onConflictDoUpdate: (_opts: unknown) => ({
              returning: async (_shape: unknown) => {
                if (tableName === "ContentNode") return [{ id: contentNodeId }];
                // ContentRelationType and any other upsert tables
                return [{ id: relTypeId }];
              },
            }),
            onConflictDoNothing: () => ({
              // ContentRelation uses onConflictDoNothing
              returning: async () => [{ id: relationId }],
            }),
            returning: async (_shape: unknown) => {
              // ContextEvidence uses a direct .returning() (no conflict handler)
              if (tableName === "ContextEvidence") return [{ id: evidenceId }];
              return [];
            },
          };
        },
      };
    },
    _inserted: inserted,
  };

  // oxlint-disable-next-line no-unsafe-type-assertion
  return db as unknown as typeof db & { _inserted: typeof inserted };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("applyStructuredContentGraphEnvelope", () => {
  it("upserts one ContentNode and returns its ID in the ref map", async () => {
    const db = makeMockDb({ contentNodeId: NODE_ID });
    const payload: StructuredContentPayload = {
      payloadVersion: "content-graph/v1",
      projectId: PROJECT_ID,
      sourceLanguageId: "en",
      importerId: "JSON",
      sourceRootRef: "content-node:abc",
      relationTypes: [],
      nodes: [
        {
          ref: "file:1",
          kind: "FILE",
          displayLabel: "test.json",
          importerId: "JSON",
          sourceRootRef: "content-node:abc",
          stableSourceNodeRef: "file-name:test.json",
          sourceType: "application/json",
          exportRole: "NONE",
          boundaryType: "NONE",
        },
      ],
      elements: [],
      relations: [],
      evidence: [],
    };

    // oxlint-disable-next-line no-unsafe-type-assertion
    const mockDb = db as unknown as Parameters<
      typeof applyStructuredContentGraphEnvelope
    >[0]["db"];
    const envelope = await applyStructuredContentGraphEnvelope(
      { db: mockDb },
      { payload },
    );

    expect(envelope.result.contentNodeIds).toHaveLength(1);
    expect(envelope.result.contentNodeIdByRef.get("file:1")).toBe(NODE_ID);
    expect(envelope.result.stableSourceNodeRefByRef.get("file:1")).toBe(
      "file-name:test.json",
    );
  });
});

describe("persistStructuredContentGraphAttachments", () => {
  it("persists one ContentRelation and one ContextEvidence row", async () => {
    const RELATION_ID = "00000000-0000-4000-8000-000000000020";
    const EVIDENCE_ID = 100;
    const db = makeMockDb({
      relTypeId: 1,
      contentNodeId: NODE_ID,
      relationId: RELATION_ID,
      evidenceId: EVIDENCE_ID,
    });

    const payload: StructuredContentPayload = {
      payloadVersion: "content-graph/v1",
      projectId: PROJECT_ID,
      sourceLanguageId: "en",
      importerId: "JSON",
      sourceRootRef: "content-node:abc",
      relationTypes: [],
      nodes: [],
      elements: [],
      relations: [
        {
          type: { namespace: "core", name: "contains", version: "1.0.0" },
          source: { kind: "NODE", nodeRef: "file:1" },
          target: { kind: "ELEMENT", elementRef: "json:/hello" },
          isPrimary: true,
          localOrder: 0,
          confidenceBasisPoints: 10000,
        },
      ],
      evidence: [
        {
          attachedTo: { kind: "ELEMENT", elementRef: "json:/hello" },
          kind: "SOURCE_LOCATION",
          textData: "Source: test.json",
          displayLabel: "source file",
          trustLevel: "COLLECTED",
        },
      ],
    };

    const envelope = {
      contentNodeIds: [NODE_ID],
      relationTypeIdsByKey: new Map([["core:contains:1.0.0", 1]]),
      contentNodeIdByRef: new Map([["file:1", NODE_ID]]),
      stableSourceNodeRefByRef: new Map([["file:1", "file-name:test.json"]]),
    };

    const elementIdByRef = new Map([["json:/hello", 42]]);

    // oxlint-disable-next-line no-unsafe-type-assertion
    const mockDb = db as unknown as Parameters<
      typeof persistStructuredContentGraphAttachments
    >[0]["db"];
    const result = await persistStructuredContentGraphAttachments(
      { db: mockDb },
      { payload, envelope, elementIdByRef },
    );

    expect(result.result.relationIds).toHaveLength(1);
    expect(result.result.contextEvidenceIds).toHaveLength(1);
    expect(result.result.contextEvidenceIds[0]).toBe(EVIDENCE_ID);
  });
});
