import { describe, expect, it } from "vitest";

import {
  EditorOverlayContentNodeRowSchema,
  EditorOverlayTranslationStateSchema,
} from "./editor-overlay-payload.ts";

const timestamp = "2026-05-17T12:34:56.000Z";

describe("editor overlay payload schemas", () => {
  it("accepts a full content-node create payload", () => {
    const payload = EditorOverlayContentNodeRowSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      creatorId: "33333333-3333-4333-8333-333333333333",
      kind: "FILE",
      displayLabel: "messages.json",
      importerId: "json-file-handler:JSON",
      sourceRootRef: "root",
      stableSourceNodeRef: "file:messages.json",
      sourceUri: null,
      sourcePath: null,
      sourceType: null,
      languageId: "en",
      exportRole: "FILE",
      boundaryType: "FILE",
      fileHandlerId: 9,
      fileId: 12,
      lifecycleStatus: "ACTIVE",
      provenance: null,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(payload.displayLabel).toBe("messages.json");
    expect(payload.lifecycleStatus).toBe("ACTIVE");
  });

  it("accepts a translation-state payload without requiring stringId", () => {
    const payload = EditorOverlayTranslationStateSchema.parse({
      translatableElementId: 42,
      languageId: "zh-Hans",
      text: "你好",
      translatorId: "33333333-3333-4333-8333-333333333333",
      approved: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(payload.translatableElementId).toBe(42);
    expect(payload.text).toBe("你好");
    expect(payload.approved).toBe(false);
  });

  it("rejects historical partial payloads", () => {
    expect(
      EditorOverlayContentNodeRowSchema.safeParse({
        projectId: "22222222-2222-4222-8222-222222222222",
        displayLabel: "messages.json",
        languageId: "en",
      }).success,
    ).toBe(false);

    expect(
      EditorOverlayTranslationStateSchema.safeParse({
        languageId: "zh-Hans",
        text: "你好",
      }).success,
    ).toBe(false);
  });
});
