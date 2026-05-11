import { describe, expect, it } from "vitest";

import { CollectionPayloadSchema } from "../collection.ts";
import {
  CoreRelationTypeDefinitions,
  FlattenedContextEvidenceSchema,
  StructuredContentPayloadSchema,
} from "../content.ts";

describe("content graph shared schemas", () => {
  it("accepts a minimal flat-file graph payload", () => {
    const payload = StructuredContentPayloadSchema.parse({
      payloadVersion: "content-graph/v1",
      projectId: "00000000-0000-4000-8000-000000000001",
      sourceLanguageId: "en",
      importerId: "json-file-handler:JSON",
      sourceRootRef: "upload:file-1",
      nodes: [
        {
          ref: "file:messages.json",
          kind: "FILE",
          displayLabel: "messages.json",
          importerId: "json-file-handler:JSON",
          sourceRootRef: "upload:file-1",
          stableSourceNodeRef: "file:messages.json",
          exportRole: "FILE",
          boundaryType: "FILE",
        },
      ],
      elements: [
        {
          ref: "json:/hello",
          stableSourceRef: "json:/hello",
          sourceNodeRef: "file:messages.json",
          text: "Hello",
          languageId: "en",
          localOrder: 0,
          meta: { key: ["hello"] },
        },
      ],
      relations: [
        {
          type: { namespace: "core", name: "contains" },
          source: { kind: "NODE", nodeRef: "file:messages.json" },
          target: { kind: "ELEMENT", elementRef: "json:/hello" },
          isPrimary: true,
          localOrder: 0,
        },
      ],
    });

    expect(payload.elements[0]?.stableSourceRef).toBe("json:/hello");
    expect(CollectionPayloadSchema.parse(payload).payloadVersion).toBe(
      "content-graph/v1",
    );
  });

  it("ships core relation definitions with containment support", () => {
    expect(CoreRelationTypeDefinitions.some((r) => r.name === "contains")).toBe(
      true,
    );
  });

  it("accepts flattened context evidence output", () => {
    const evidence = FlattenedContextEvidenceSchema.parse({
      purpose: "EDITOR",
      priority: 0,
      label: "same file",
      score: 12,
      sourceEndpoint: "element:1",
      relatedEndpoint: "element:2",
      trustLevel: "COLLECTED",
      freshness: null,
      clipped: false,
      payload: { text: "Hello" },
      expansion: null,
    });
    expect(evidence.label).toBe("same file");
  });
});
