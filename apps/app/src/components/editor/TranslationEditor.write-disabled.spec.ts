import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "@/utils/i18n";

const mocks = vi.hoisted(() => ({
  tokenize: vi.fn(async () => ({ tokens: [] })),
  advanceSuggestion: vi.fn(),
  canWrite: false,
  disabledReason:
    "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。",
  translationValue: "已有译文",
  elementId: 1 as number | null,
  translationTokens: [] as unknown[],
  languageToId: "zh-Hans" as string | undefined,
  suggestion: null as string | null,
  anchorPosition: 0,
}));

vi.mock("@/rpc/ws", () => ({
  ws: {
    tokenizer: {
      tokenize: mocks.tokenize,
    },
  },
}));

vi.mock("@/stores/editor/context.ts", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");
  return {
    useEditorContextStore: defineStore("translationEditorContextSpec", () => ({
      languageToId: ref(mocks.languageToId),
    })),
  };
});

vi.mock("@/stores/editor/table.ts", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");
  return {
    useEditorTableStore: defineStore("translationEditorTableSpec", () => ({
      translationValue: ref(mocks.translationValue),
      elementId: ref(mocks.elementId),
      translationTokens: ref(mocks.translationTokens),
      editorView: ref(null),
    })),
  };
});

vi.mock("@/stores/editor/ghost-text.ts", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");
  return {
    useEditorGhostTextStore: defineStore(
      "translationEditorGhostTextSpec",
      () => ({
        suggestion: ref(mocks.suggestion),
        anchorPosition: ref(mocks.anchorPosition),
        advanceSuggestion: mocks.advanceSuggestion,
      }),
    ),
  };
});

vi.mock("@/stores/write-capability", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");
  return {
    useProjectWriteCapabilityStore: defineStore(
      "translationEditorWriteCapabilitySpec",
      () => ({
        canWrite: computed(() => mocks.canWrite),
        disabledReason: computed(() => mocks.disabledReason),
      }),
    ),
  };
});

import TranslationEditor from "./TranslationEditor.vue";

describe("TranslationEditor write-disabled", () => {
  beforeEach(() => {
    mocks.tokenize.mockClear();
    mocks.canWrite = false;
    mocks.disabledReason =
      "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。";
    mocks.translationValue = "已有译文";
    mocks.elementId = 1;
    mocks.translationTokens = [];
    mocks.suggestion = null;
    mocks.anchorPosition = 0;
  });

  it("renders the editor as read-only and exposes the disabled reason", async () => {
    const wrapper = mount(TranslationEditor, {
      attachTo: document.body,
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    await flushPromises();

    expect(wrapper.attributes("aria-disabled")).toBe("true");
    expect(wrapper.attributes("title")).toBe(
      "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。",
    );
    expect(wrapper.get(".cm-content").attributes("contenteditable")).toBe(
      "false",
    );
    expect(mocks.tokenize).not.toHaveBeenCalled();
  });
});
