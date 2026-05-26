import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";

import { i18n } from "@/utils/i18n";

import ReviewActionBar from "./ReviewActionBar.vue";

describe("ReviewActionBar", () => {
  const selectedCandidate = {
    findings: [],
  };

  it("does not render action buttons until a candidate is selected", () => {
    const wrapper = mount(ReviewActionBar, {
      props: { candidate: null, noteBody: "" },
      global: {
        plugins: [createPinia(), i18n],
      },
    });
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("changes button labels when note body is present", () => {
    const wrapper = mount(ReviewActionBar, {
      props: { candidate: selectedCandidate, noteBody: "Needs audit trail" },
      global: {
        plugins: [createPinia(), i18n],
      },
    });
    expect(wrapper.text()).toContain("批注并同意");
    expect(wrapper.text()).toContain("批注并拒绝");
    expect(wrapper.text()).toContain("批注并跳过");
  });

  it("disables note input and action buttons when writing is blocked", () => {
    const wrapper = mount(ReviewActionBar, {
      props: {
        candidate: selectedCandidate,
        noteBody: "",
        writeDisabled: true,
        disabledReason:
          "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。",
      },
      global: {
        plugins: [createPinia(), i18n],
      },
    });

    const actionButtons = wrapper
      .findAll("button")
      .filter((button) =>
        ["跳过", "拒绝", "同意"].some((label) => button.text().includes(label)),
      );

    expect(wrapper.find("textarea").attributes("disabled")).toBeDefined();
    expect(
      actionButtons.every(
        (button) => button.attributes("disabled") !== undefined,
      ),
    ).toBe(true);
  });
});
