import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

import { i18n } from "@/utils/i18n";

const mocks = vi.hoisted(() => ({
  approvedTranslationId: 1 as number | null,
}));

vi.mock("@/stores/editor/table", async () => {
  const { defineStore } = await import("pinia");

  return {
    useEditorTableStore: defineStore(
      "translationBranchOverlayTableSpec",
      () => ({
        element: ref({ approvedTranslationId: mocks.approvedTranslationId }),
      }),
    ),
  };
});

vi.mock("@/components/editor/TokenViewer.vue", () => ({
  default: {
    props: ["text"],
    template: '<div data-test="token-viewer">{{ text }}</div>',
  },
}));

vi.mock("@/components/tooltip/TextTooltip.vue", () => ({
  default: {
    template: "<div><slot /></div>",
  },
}));

vi.mock("@/components/UserAvatar.vue", () => ({
  default: {
    template: '<div data-test="user-avatar" />',
  },
}));

vi.mock("./TranslationVote.vue", () => ({
  default: {
    props: ["translation"],
    template: '<div data-test="translation-vote">vote</div>',
  },
}));

vi.mock("./TranslationQaResult.vue", () => ({
  default: {
    props: ["translationId"],
    template:
      '<div data-test="translation-qa-result" :data-translation-id="translationId">qa</div>',
  },
}));

import Translation from "./Translation.vue";

describe("Translation branch overlay rendering", () => {
  beforeEach(() => {
    mocks.approvedTranslationId = 1;
  });

  it("renders branch-only overlays without vote and QA metadata widgets", () => {
    const wrapper = mount(Translation, {
      props: {
        translation: {
          kind: "branch-overlay",
          overlayEntityId: "overlay-1",
          translatableElementId: 1,
          languageId: "zh-Hans",
          text: "分支草稿译文",
          translatorId: null,
          approved: false,
          vote: 0,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        },
      },
      global: {
        plugins: [createPinia(), i18n],
        stubs: {
          Collapsible: { template: "<div><slot /></div>" },
          CollapsibleTrigger: { template: "<div><slot /></div>" },
          CollapsibleContent: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.text()).toContain("分支草稿翻译暂不支持投票");
    expect(wrapper.text()).toContain("分支草稿翻译暂不支持 QA 元数据");
    expect(wrapper.find('[data-test="translation-vote"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="translation-qa-result"]').exists()).toBe(
      false,
    );
  });

  it("keeps vote and QA metadata visible for main translations", () => {
    const wrapper = mount(Translation, {
      props: {
        translation: {
          kind: "main",
          id: 1,
          text: "主线译文",
          vote: 2,
          translatorId: null,
          translatableElementId: 1,
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          meta: null,
        },
      },
      global: {
        plugins: [createPinia(), i18n],
        stubs: {
          Collapsible: { template: "<div><slot /></div>" },
          CollapsibleTrigger: { template: "<div><slot /></div>" },
          CollapsibleContent: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.find('[data-test="translation-vote"]').exists()).toBe(true);
    expect(
      wrapper
        .find('[data-test="translation-qa-result"]')
        .attributes("data-translation-id"),
    ).toBe("1");
    expect(wrapper.text()).not.toContain("分支草稿翻译暂不支持投票");
  });
});
