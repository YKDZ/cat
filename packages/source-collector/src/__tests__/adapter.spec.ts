import type { ExtractionResult } from "@cat/shared";

import { describe, expect, it } from "vitest";

import { toCollectionPayload } from "../adapter.ts";

describe("toCollectionPayload", () => {
  const baseResult: ExtractionResult = {
    elements: [{ ref: "ref1", text: "Hello", meta: { framework: "vue-i18n" } }],
    contexts: [
      { elementRef: "ref1", type: "TEXT", data: { text: "Source: app.vue" } },
    ],
    metadata: {
      extractorIds: ["vue-i18n"],
      baseDir: "/home/user/project",
      timestamp: "2026-04-20T08:00:00.000Z",
    },
  };

  it("assembles CollectionPayload from ExtractionResult + routing", () => {
    const payload = toCollectionPayload(baseResult, {
      projectId: "00000000-0000-0000-0000-000000000001",
      sourceLanguageId: "en",
      documentName: "test-doc",
    });

    expect(payload.projectId).toBe("00000000-0000-0000-0000-000000000001");
    expect(payload.sourceLanguageId).toBe("en");
    expect(payload.document.name).toBe("test-doc");
    expect(payload.elements).toHaveLength(1);
    expect(payload.contexts).toHaveLength(1);
  });

  it("discards metadata from ExtractionResult", () => {
    const payload = toCollectionPayload(baseResult, {
      projectId: "00000000-0000-0000-0000-000000000001",
      sourceLanguageId: "en",
      documentName: "test-doc",
    });

    // CollectionPayload has no metadata field
    expect((payload as Record<string, unknown>).metadata).toBeUndefined();
  });

  it("includes optional fileHandlerId and options", () => {
    const payload = toCollectionPayload(baseResult, {
      projectId: "00000000-0000-0000-0000-000000000001",
      sourceLanguageId: "en",
      documentName: "test-doc",
      fileHandlerId: "handler-1",
      options: { branchId: 42 },
    });

    expect(payload.document.fileHandlerId).toBe("handler-1");
    expect(payload.options?.branchId).toBe(42);
  });

  it("handles ExtractionResult without metadata", () => {
    const noMeta: ExtractionResult = { elements: [], contexts: [] };
    const payload = toCollectionPayload(noMeta, {
      projectId: "00000000-0000-0000-0000-000000000001",
      sourceLanguageId: "en",
      documentName: "doc",
    });

    expect(payload.elements).toHaveLength(0);
  });
});
