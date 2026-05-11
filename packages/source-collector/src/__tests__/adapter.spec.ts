import { describe, expect, it } from "vitest";

import type { SourceExtractionGraphResult } from "../types.ts";

import { toCollectionPayload } from "../adapter.ts";

describe("toCollectionPayload", () => {
  const baseResult: SourceExtractionGraphResult = {
    importerId: "vue-i18n",
    relationTypes: [],
    nodes: [
      {
        ref: "source-file:src/app.vue",
        kind: "SOURCE_COMPONENT",
        displayLabel: "src/app.vue",
        importerId: "vue-i18n",
        sourceRootRef: "/home/user/project",
        stableSourceNodeRef: "source-file:src/app.vue",
        sourcePath: "src/app.vue",
        sourceType: "vue",
        exportRole: "NONE",
        boundaryType: "FILE",
      },
    ],
    elements: [
      {
        ref: "vue-i18n:src/app.vue:template:L1:C0",
        stableSourceRef: "source:src/app.vue:template:L1:C0",
        sourceNodeRef: "source-file:src/app.vue",
        text: "Hello",
        languageId: "en",
        localOrder: 0,
      },
    ],
    relations: [],
    evidence: [
      {
        attachedTo: {
          kind: "ELEMENT",
          elementRef: "vue-i18n:src/app.vue:template:L1:C0",
        },
        kind: "SOURCE_LOCATION",
        textData: "Source: src/app.vue",
        displayLabel: "source file",
        trustLevel: "COLLECTED",
      },
    ],
  };

  it("assembles StructuredContentPayload from SourceExtractionGraphResult + routing", () => {
    const payload = toCollectionPayload(baseResult, {
      projectId: "12345678-1234-4000-8000-000000000001",
      sourceLanguageId: "en",
      sourceRootRef: "/home/user/project",
    });

    expect(payload.projectId).toBe("12345678-1234-4000-8000-000000000001");
    expect(payload.sourceLanguageId).toBe("en");
    expect(payload.sourceRootRef).toBe("/home/user/project");
    expect(payload.payloadVersion).toBe("content-graph/v1");
    expect(payload.nodes).toHaveLength(1);
    expect(payload.elements).toHaveLength(1);
    expect(payload.evidence).toHaveLength(1);
  });

  it("handles empty nodes/elements/relations/evidence", () => {
    const empty: SourceExtractionGraphResult = {
      importerId: "test",
      relationTypes: [],
      nodes: [
        {
          ref: "source-file:empty",
          kind: "SOURCE_COMPONENT",
          displayLabel: "empty",
          importerId: "test",
          sourceRootRef: "/",
          stableSourceNodeRef: "source-file:empty",
          exportRole: "NONE",
          boundaryType: "FILE",
        },
      ],
      elements: [],
      relations: [],
      evidence: [],
    };
    const payload = toCollectionPayload(empty, {
      projectId: "12345678-1234-4000-8000-000000000001",
      sourceLanguageId: "en",
      sourceRootRef: "/",
    });

    expect(payload.elements).toHaveLength(0);
    expect(payload.evidence).toHaveLength(0);
  });

  it("passes options through", () => {
    const payload = toCollectionPayload(baseResult, {
      projectId: "12345678-1234-4000-8000-000000000001",
      sourceLanguageId: "en",
      sourceRootRef: "/home/user/project",
      options: { branchId: 42 },
    });

    expect(payload.options?.branchId).toBe(42);
  });
});
