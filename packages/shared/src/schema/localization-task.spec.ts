import { describe, expect, it } from "vitest";

import {
  BatchAutoTranslationInvocationSchema,
  BatchAutoTranslationTaskPayloadSchema,
  BatchAutoTranslationTaskResultSchema,
  OperationFailureSchema,
  toOperationFailureClientProjection,
} from "./localization-task.ts";

const vectorStorage = {
  pluginId: "test.vector",
  serviceId: "default",
  serviceType: "VECTOR_STORAGE" as const,
  scopeType: "GLOBAL" as const,
  scopeId: "" as const,
};

describe("batch auto-translation task contract", () => {
  it("persists a complete typed invocation descriptor for retry", () => {
    const invocation = {
      projectId: "0113d502-f8c3-4d21-98dc-0e3c6c5cc701",
      contentNodeIds: [],
      elementIds: [41, 42],
      sortMode: "structure" as const,
      languageId: "zh-Hans",
      minMemorySimilarity: 0.8,
      maxMemoryAmount: 5,
      memoryVectorStorage: vectorStorage,
      translationVectorStorage: vectorStorage,
      vectorizer: {
        ...vectorStorage,
        pluginId: "test.vectorizer",
        serviceType: "TEXT_VECTORIZER" as const,
      },
      translatorId: "4a72bfde-f298-44de-a387-2b940805ac2e",
      memoryIds: ["4157e8e7-9ec9-45ca-9e91-43149fe99d94"],
      glossaryIds: ["41857ebf-040e-44d8-a52a-82842879690b"],
      config: {
        gatherScopeContext: true,
        highConfidenceThreshold: 0.91,
      },
    };

    const payload = BatchAutoTranslationTaskPayloadSchema.parse({
      invocation,
      cancelable: true,
    });

    expect(payload.invocation).toEqual(invocation);
    expect(() =>
      BatchAutoTranslationTaskPayloadSchema.parse({
        invocation: { ...invocation, unexpected: true },
        cancelable: true,
      }),
    ).toThrow();
  });

  it("does not mix translation ids with element ids", () => {
    expect(
      BatchAutoTranslationTaskResultSchema.parse({
        translationIds: [301, 302],
        translatedElementIds: [41],
        skippedElementIds: [42],
      }),
    ).toEqual({
      translationIds: [301, 302],
      translatedElementIds: [41],
      skippedElementIds: [42],
    });
  });

  it("allows a resolved task snapshot larger than the direct-selection limit", () => {
    const elementIds = Array.from({ length: 1_001 }, (_, index) => index + 1);

    expect(
      BatchAutoTranslationInvocationSchema.parse({
        projectId: "0113d502-f8c3-4d21-98dc-0e3c6c5cc701",
        contentNodeIds: [],
        elementIds,
        sortMode: "structure",
        languageId: "zh-Hans",
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer: {
          ...vectorStorage,
          pluginId: "test.vectorizer",
          serviceType: "TEXT_VECTORIZER",
        },
        translatorId: "4a72bfde-f298-44de-a387-2b940805ac2e",
      }).elementIds,
    ).toHaveLength(1_001);
  });

  it("rejects branch scope in a persisted batch invocation", () => {
    expect(() =>
      BatchAutoTranslationInvocationSchema.parse({
        projectId: "0113d502-f8c3-4d21-98dc-0e3c6c5cc701",
        branchId: 1,
        contentNodeIds: [],
        elementIds: [],
        sortMode: "structure",
        languageId: "zh-Hans",
        memoryVectorStorage: vectorStorage,
        translationVectorStorage: vectorStorage,
        vectorizer: {
          ...vectorStorage,
          pluginId: "test.vectorizer",
          serviceType: "TEXT_VECTORIZER",
        },
        translatorId: "4a72bfde-f298-44de-a387-2b940805ac2e",
      }),
    ).toThrow();
  });

  it("projects public and internal operation failures as a discriminated client union", () => {
    const failure = OperationFailureSchema.parse({
      affectedResources: [
        { type: "PROJECT", id: "0113d502-f8c3-4d21-98dc-0e3c6c5cc701" },
      ],
      code: "CAT_OPERATION_FAILED",
      id: "4a72bfde-f298-44de-a387-2b940805ac2e",
      message: "internal diagnostic must not reach the browser",
      redactionBoundary: "INTERNAL",
      retryable: false,
      severity: "ERROR",
    });
    const redacted = toOperationFailureClientProjection(failure);

    expect(redacted).toMatchObject({
      code: "CAT_OPERATION_FAILED",
      redacted: true,
    });
    expect("message" in redacted).toBe(false);

    const publicProjection = toOperationFailureClientProjection({
      ...failure,
      redactionBoundary: "PUBLIC",
    });
    expect(publicProjection).toMatchObject({
      message: failure.message,
      redacted: false,
    });
  });
});
