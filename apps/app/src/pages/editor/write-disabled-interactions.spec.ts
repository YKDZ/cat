import type { MemorySuggestion, TranslationSuggestion } from "@cat/shared";

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { i18n } from "@/utils/i18n";

const mocks = vi.hoisted(() => ({
  canWrite: false,
  disabledReason:
    "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。",
  replace: vi.fn(),
  insert: vi.fn(),
  getMemory: vi.fn(async (_input: { memoryId: string }) => ({
    name: "记忆库",
  })),
}));

vi.mock("@cat/ui", async () => {
  const passthrough = (tag: string) =>
    defineComponent({
      inheritAttrs: false,
      template: `<${tag} v-bind="$attrs"><slot /></${tag}>`,
    });

  return {
    Badge: passthrough("span"),
    Button: passthrough("button"),
    Skeleton: passthrough("div"),
  };
});

vi.mock("@lucide/vue", () => ({
  ArrowRight: defineComponent({ template: '<svg data-icon="arrow-right" />' }),
}));

vi.mock("@/components/editor/TokenViewer.vue", () => ({
  default: defineComponent({
    props: {
      text: {
        type: String,
        required: true,
      },
    },
    template: "<span>{{ text }}</span>",
  }),
}));

vi.mock("@/components/tooltip/TextTooltip.vue", () => ({
  default: defineComponent({
    template: "<div><slot /></div>",
  }),
}));

vi.mock("@/stores/editor/table.ts", async () => {
  const { defineStore } = await import("pinia");
  return {
    useEditorTableStore: defineStore("writeDisabledItemsTableSpec", () => ({
      replace: (value: string) => mocks.replace(value),
      insert: (value: string) => mocks.insert(value),
    })),
  };
});

vi.mock("@/stores/editor/context.ts", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");
  return {
    useEditorContextStore: defineStore("writeDisabledItemsContextSpec", () => ({
      project: ref({ id: "11111111-1111-4111-8111-111111111111" }),
    })),
  };
});

vi.mock("@/stores/write-capability", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");
  return {
    useProjectWriteCapabilityStore: defineStore(
      "writeDisabledItemsCapabilitySpec",
      () => ({
        canWrite: computed(() => mocks.canWrite),
        disabledReason: computed(() => mocks.disabledReason),
      }),
    ),
  };
});

vi.mock("@/utils/magic-keys.ts", () => ({
  useHotKeys: vi.fn(),
}));

vi.mock("@/rpc/orpc", async () => {
  return {
    orpc: {
      memory: {
        get: async (input: { memoryId: string }) => await mocks.getMemory(input),
      },
      plugin: {
        getTranslationAdvisor: vi.fn(async () => ({ id: 1, name: "Advisor" })),
      },
    },
  };
});

vi.mock("@pinia/colada", async () => {
  const { ref } = await import("vue");

  return {
    useQuery: vi.fn(() => ({
      state: ref({
        status: "success",
        data: { id: 1, name: "Advisor" },
      }),
    })),
  };
});

vi.mock("vike/client/router", () => ({
  navigate: vi.fn(),
}));

import MemoryListItem from "./MemoryListItem.vue";
import SuggestionListItem from "./SuggestionListItem.vue";
import TermListItem from "./TermListItem.vue";

describe("write-disabled editor interactions", () => {
  const suggestion = {
    advisorId: 1,
    translation: "建议译文",
    createdAt: new Date(),
    confidence: 0.9,
  } as TranslationSuggestion;

  const memorySuggestion = {
    id: 1,
    translationChunkSetId: null,
    source: "Memory source",
    memoryId: "11111111-1111-4111-8111-111111111111",
    creatorId: null,
    translation: "记忆译文",
    sourceScope: "PROJECT",
    translationId: null,
    sourceTemplate: null,
    translationTemplate: null,
    confidence: 0.95,
    createdAt: new Date(),
    updatedAt: new Date(),
    evidences: [],
    adaptedTranslation: undefined,
  } as MemorySuggestion;

  const term = {
    term: "Source",
    translation: "术语译文",
    definition: "Definition",
  };

  beforeEach(() => {
    mocks.canWrite = false;
    mocks.disabledReason =
      "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。";
    mocks.replace.mockReset();
    mocks.insert.mockReset();
    mocks.getMemory.mockClear();
  });

  it("blocks suggestion, memory, and term insertion when writing is disabled", async () => {
    const plugins = [createPinia(), i18n];

    const suggestionWrapper = mount(SuggestionListItem, {
      props: { suggestion, index: 0 },
      global: { plugins },
    });
    const memoryWrapper = mount(MemoryListItem, {
      props: { memorySuggestion, index: 0 },
      global: { plugins },
    });
    const termWrapper = mount(TermListItem, {
      props: { term, index: 0 },
      global: { plugins },
    });

    await flushPromises();

    await suggestionWrapper.get("button").trigger("click");
    await memoryWrapper.get("button").trigger("click");
    await termWrapper.get("[aria-disabled='true']").trigger("click");

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("allows suggestion, memory, and term insertion when writing is enabled", async () => {
    mocks.canWrite = true;
    const plugins = [createPinia(), i18n];

    const suggestionWrapper = mount(SuggestionListItem, {
      props: { suggestion, index: 0 },
      global: { plugins },
    });
    const memoryWrapper = mount(MemoryListItem, {
      props: { memorySuggestion, index: 0 },
      global: { plugins },
    });
    const termWrapper = mount(TermListItem, {
      props: { term, index: 0 },
      global: { plugins },
    });

    await flushPromises();

    await suggestionWrapper.get("button").trigger("click");
    await memoryWrapper.get("button").trigger("click");
    await termWrapper.get(".cursor-pointer").trigger("click");

    expect(mocks.replace).toHaveBeenNthCalledWith(1, "建议译文");
    expect(mocks.replace).toHaveBeenNthCalledWith(2, "记忆译文");
    expect(mocks.insert).toHaveBeenCalledWith("术语译文");
  });
});
