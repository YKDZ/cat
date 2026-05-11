import {
  CoreRelationTypeDefinitions,
  type StructuredContentPayload,
} from "@cat/shared";
import { describe, expect, it } from "vitest";

import { assertStructuredPayloadGraphValid } from "./graph-validation";

const basePayload = (): StructuredContentPayload => ({
  payloadVersion: "content-graph/v1",
  projectId: "00000000-0000-4000-8000-000000000001",
  sourceLanguageId: "en",
  importerId: "test-importer",
  sourceRootRef: "root",
  relationTypes: [],
  nodes: [
    {
      ref: "root",
      kind: "PROJECT_ROOT",
      displayLabel: "root",
      importerId: "test-importer",
      sourceRootRef: "root",
      stableSourceNodeRef: "root",
      exportRole: "PROJECT_ROOT",
      boundaryType: "PROJECT",
    },
    {
      ref: "file",
      kind: "FILE",
      displayLabel: "messages.json",
      importerId: "test-importer",
      sourceRootRef: "root",
      stableSourceNodeRef: "file",
      exportRole: "FILE",
      boundaryType: "FILE",
    },
  ],
  elements: [
    {
      ref: "json:/hello",
      stableSourceRef: "json:/hello",
      sourceNodeRef: "file",
      text: "Hello",
      languageId: "en",
    },
  ],
  relations: [
    {
      type: { namespace: "core", name: "contains", version: "1.0.0" },
      source: { kind: "NODE", nodeRef: "root" },
      target: { kind: "NODE", nodeRef: "file" },
      isPrimary: true,
      localOrder: 0,
      confidenceBasisPoints: 10000,
    },
    {
      type: { namespace: "core", name: "contains", version: "1.0.0" },
      source: { kind: "NODE", nodeRef: "file" },
      target: { kind: "ELEMENT", elementRef: "json:/hello" },
      isPrimary: true,
      localOrder: 0,
      confidenceBasisPoints: 10000,
    },
  ],
  evidence: [],
  options: {},
});

describe("assertStructuredPayloadGraphValid", () => {
  it("accepts one primary parent per exportable node and element", () => {
    expect(() => {
      assertStructuredPayloadGraphValid(
        basePayload(),
        CoreRelationTypeDefinitions,
      );
    }).not.toThrow();
  });

  it("rejects missing primary element containment", () => {
    const payload = basePayload();
    payload.relations = payload.relations.filter(
      (relation) => relation.target.kind !== "ELEMENT",
    );
    expect(() => {
      assertStructuredPayloadGraphValid(payload, CoreRelationTypeDefinitions);
    }).toThrow(
      "Element json:/hello must have exactly one primary parent relation",
    );
  });

  it("rejects relation endpoint pairs that are not registered", () => {
    const payload = basePayload();
    payload.relations.push({
      type: { namespace: "core", name: "contains", version: "1.0.0" },
      source: { kind: "ELEMENT", elementRef: "json:/hello" },
      target: { kind: "NODE", nodeRef: "file" },
      isPrimary: false,
      confidenceBasisPoints: 10000,
    });
    expect(() => {
      assertStructuredPayloadGraphValid(payload, CoreRelationTypeDefinitions);
    }).toThrow("does not allow ELEMENT->NODE");
  });

  it("rejects primary containment cycles", () => {
    const payload = basePayload();
    payload.nodes.push({
      ref: "folder",
      kind: "DIRECTORY",
      displayLabel: "folder",
      importerId: "test-importer",
      sourceRootRef: "root",
      stableSourceNodeRef: "folder",
      exportRole: "DIRECTORY",
      boundaryType: "DIRECTORY",
    });
    payload.relations.push(
      {
        type: { namespace: "core", name: "contains", version: "1.0.0" },
        source: { kind: "NODE", nodeRef: "file" },
        target: { kind: "NODE", nodeRef: "folder" },
        isPrimary: true,
        localOrder: 0,
        confidenceBasisPoints: 10000,
      },
      {
        type: { namespace: "core", name: "contains", version: "1.0.0" },
        source: { kind: "NODE", nodeRef: "folder" },
        target: { kind: "NODE", nodeRef: "file" },
        isPrimary: true,
        localOrder: 1,
        confidenceBasisPoints: 10000,
      },
    );
    expect(() => {
      assertStructuredPayloadGraphValid(payload, CoreRelationTypeDefinitions);
    }).toThrow("Primary containment cycle detected");
  });
});
