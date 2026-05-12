/**
 * @zh 验证 buildUserPrompt 接受 FlattenedContextEvidence 并正确渲染证据区块。
 * @en Verify buildUserPrompt accepts FlattenedContextEvidence and renders the evidence block correctly.
 */
import { describe, expect, it } from "vitest";

import { buildUserPromptForTest } from "./llm-translate";

const BASE_CONTEXT = {
  sourceText: "Hello",
  sourceLanguageId: "en",
  targetLanguageId: "fr",
  config: {
    memory: true,
    term: true,
    elementMeta: true,
    neighborTranslations: true,
    elementContexts: { enabled: true },
    approvedTranslations: { enabled: true, maxCount: 5 },
    comments: { enabled: false, maxCount: 5 },
  },
  memories: [],
  terms: [],
  sessionTranslations: [],
  elementMeta: null,
  neighborTranslations: [],
  approvedTranslations: [],
  comments: [],
};

describe("buildUserPromptForTest with FlattenedContextEvidence", () => {
  it("includes evidence section with label and text", () => {
    const prompt = buildUserPromptForTest({
      ...BASE_CONTEXT,
      evidence: [
        {
          purpose: "AI" as const,
          priority: 0,
          label: "source text",
          score: 100,
          sourceEndpoint: "element:1",
          relatedEndpoint: null,
          trustLevel: "VERIFIED" as const,
          freshness: null,
          clipped: false,
          payload: { text: "Hello", languageId: "en" },
          expansion: null,
        },
        {
          purpose: "AI" as const,
          priority: 10,
          label: "screenshot note",
          score: 80,
          sourceEndpoint: "element:1",
          relatedEndpoint: null,
          trustLevel: "COLLECTED" as const,
          freshness: null,
          clipped: false,
          payload: { text: "Shown on the home page" },
          expansion: null,
        },
      ],
    });

    expect(prompt).toContain("Context evidence");
    expect(prompt).toContain("screenshot note");
    expect(prompt).toContain("Shown on the home page");
  });

  it("omits evidence section when evidence is empty", () => {
    const prompt = buildUserPromptForTest({
      ...BASE_CONTEXT,
      evidence: [],
    });

    expect(prompt).not.toContain("Context evidence");
  });

  it("omits evidence section when elementContexts config is disabled", () => {
    const prompt = buildUserPromptForTest({
      ...BASE_CONTEXT,
      config: {
        ...BASE_CONTEXT.config,
        elementContexts: { enabled: false },
      },
      evidence: [
        {
          purpose: "AI" as const,
          priority: 0,
          label: "source text",
          score: 100,
          sourceEndpoint: "element:1",
          relatedEndpoint: null,
          trustLevel: "VERIFIED" as const,
          freshness: null,
          clipped: false,
          payload: { text: "Hello" },
          expansion: null,
        },
      ],
    });

    expect(prompt).not.toContain("Context evidence");
  });
});
