import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { i18n } from "@/utils/i18n";

import Toolbar from "./Toolbar.vue";

const mocks = vi.hoisted(() => ({
  activeContentNodeId: undefined as string | undefined,
  currentElementContentNodeId: undefined as string | undefined,
  canWrite: true,
  disabledReason: null as string | null,
  element: null as null | {
    id: number;
    value: string;
    languageId: string;
  },
  translationValue: "你好",
  sourceTokens: [] as unknown[],
  translationTokens: [] as unknown[],
  translate: vi.fn(),
  toNextUntranslated: vi.fn(),
  replace: vi.fn(),
  clear: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
}));

vi.mock("@cat/ui", async () => {
  const { defineComponent } = await import("vue");
  return {
    Button: defineComponent({
      inheritAttrs: false,
      template: '<button v-bind="$attrs"><slot /></button>',
    }),
  };
});

vi.mock("@lucide/vue", () => {
  const icon = (name: string) =>
    defineComponent({
      template: `<svg data-icon="${name}" />`,
    });

  return {
    Check: icon("check"),
    Copy: icon("copy"),
    MoveRight: icon("move-right"),
    Redo: icon("redo"),
    Trash: icon("trash"),
    Undo: icon("undo"),
  };
});

vi.mock("@/components/tooltip/TextTooltip.vue", () => ({
  default: defineComponent({
    template: "<div><slot /></div>",
  }),
}));

vi.mock("./CurrentTranslationQaResult.vue", () => ({
  default: defineComponent({
    props: {
      contentNodeId: {
        type: String,
        default: undefined,
      },
    },
    template: '<div data-testid="qa-content-node-id">{{ contentNodeId }}</div>',
  }),
}));

vi.mock("@/stores/editor/context", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useEditorContextStore: defineStore("editorToolbarContextSpec", () => ({
      activeContentNodeId: computed(() => mocks.activeContentNodeId),
      currentElementContentNodeId: computed(
        () => mocks.currentElementContentNodeId,
      ),
    })),
  };
});

vi.mock("@/stores/editor/table.ts", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useEditorTableStore: defineStore("editorToolbarTableSpec", () => ({
      element: computed(() => mocks.element),
      translationValue: computed(() => mocks.translationValue),
      sourceTokens: computed(() => mocks.sourceTokens),
      translationTokens: computed(() => mocks.translationTokens),
      translate() {
        return mocks.translate();
      },
      toNextUntranslated() {
        return mocks.toNextUntranslated();
      },
      replace(value: string) {
        return mocks.replace(value);
      },
      clear() {
        return mocks.clear();
      },
      undo() {
        return mocks.undo();
      },
      redo() {
        return mocks.redo();
      },
    })),
  };
});

vi.mock("@/stores/write-capability", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useProjectWriteCapabilityStore: defineStore(
      "editorToolbarWriteCapabilitySpec",
      () => ({
        canWrite: computed(() => mocks.canWrite),
        disabledReason: computed(() => mocks.disabledReason),
      }),
    ),
  };
});

describe("Toolbar QA context", () => {
  beforeEach(() => {
    mocks.element = {
      id: 1,
      value: "Hello",
      languageId: "en-US",
    };
    mocks.translationValue = "你好";
    mocks.sourceTokens = [];
    mocks.translationTokens = [];
    mocks.activeContentNodeId = undefined;
    mocks.currentElementContentNodeId = undefined;
    mocks.canWrite = true;
    mocks.disabledReason = null;
  });

  it("uses the current element primary content node in a full-project scope", () => {
    mocks.currentElementContentNodeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    const wrapper = mount(Toolbar, {
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    expect(wrapper.get('[data-testid="qa-content-node-id"]').text()).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("prefers the current element node over the selected directory filter", () => {
    mocks.activeContentNodeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mocks.currentElementContentNodeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    const wrapper = mount(Toolbar, {
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    expect(wrapper.get('[data-testid="qa-content-node-id"]').text()).toBe(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
  });

  it("keeps QA context visible while disabling editor actions when write is blocked", () => {
    mocks.currentElementContentNodeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    mocks.canWrite = false;
    mocks.disabledReason =
      "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。";

    const wrapper = mount(Toolbar, {
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    expect(wrapper.get('[data-testid="qa-content-node-id"]').text()).toBe(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(
      wrapper
        .findAll("button")
        .every((button) => button.attributes("disabled") !== undefined),
    ).toBe(true);
  });
});
