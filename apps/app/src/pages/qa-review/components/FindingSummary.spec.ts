import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";

import { i18n } from "@/utils/i18n";

import FindingSummary from "./FindingSummary.vue";

describe("FindingSummary", () => {
  it("renders clean state when no findings", () => {
    const wrapper = mount(FindingSummary, {
      props: { candidate: { findings: [] } },
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    expect(wrapper.text()).toContain("未发现问题");
  });

  it("renders blocking summary and keeps technical details collapsed by default", () => {
    const wrapper = mount(FindingSummary, {
      props: {
        candidate: {
          findings: [
            {
              id: 1,
              action: "BLOCK_APPROVAL",
              ruleFamily: "placeholder",
              ruleId: "missing-placeholder",
              severity: "error",
              riskScore: 100,
              message: "Missing placeholder",
            },
          ],
        },
      },
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    expect(wrapper.text()).toContain("阻断批准");
    expect(wrapper.text()).toContain("技术细节");
    expect(wrapper.text()).not.toContain("placeholder · missing-placeholder");
  });
});
