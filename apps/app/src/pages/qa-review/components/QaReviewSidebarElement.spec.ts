import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "@/utils/i18n";

const selectElement = vi.fn();

vi.mock("@cat/ui", async () => {
  const { defineComponent } = await import("vue");

  return {
    Badge: defineComponent({
      template: "<span><slot /></span>",
    }),
    SidebarMenuItem: defineComponent({
      template: "<div><slot /></div>",
    }),
    SidebarMenuButton: defineComponent({
      template: '<button type="button"><slot /></button>',
    }),
  };
});

vi.mock("@/stores/qa-review/workbench", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");

  return {
    useQaReviewWorkbenchStore: defineStore("qaReviewWorkbenchSpec", () => {
      const elements = ref([
        {
          elementId: 1,
          riskBucket: "BLOCKING",
          hardFindingCount: 2,
          candidateCount: 3,
          approvedTranslationId: null,
          sourceText: "Apple",
          primaryContentNodeLabel: "a.json",
        },
        {
          elementId: 2,
          riskBucket: "LOW",
          hardFindingCount: 0,
          candidateCount: 1,
          approvedTranslationId: 10,
          sourceText: "Banana",
          primaryContentNodeLabel: "b.json",
        },
      ]);
      const selectedElementId = ref<number | null>(null);

      return {
        elements,
        selectedElementId,
        selectElement,
      };
    }),
  };
});

import QaReviewSidebarElement from "./QaReviewSidebarElement.vue";

describe("QaReviewSidebarElement", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    selectElement.mockReset();
  });

  it("renders element items with risk/candidate badges", () => {
    const wrapper = mount(QaReviewSidebarElement, {
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    expect(wrapper.text()).toContain("Apple");
    expect(wrapper.text()).toContain("Banana");
    expect(wrapper.text()).toContain("候选");
    expect(wrapper.text()).toContain("已批准");
  });
});
