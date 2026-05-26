import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { i18n } from "@/utils/i18n";

import ProjectPageDataError from "./ProjectPageDataError.vue";

describe("ProjectPageDataError", () => {
  it("renders the localized title and message", () => {
    const wrapper = mount(ProjectPageDataError, {
      props: {
        message: "PR list failed",
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain("页面数据加载失败");
    expect(wrapper.text()).toContain("PR list failed");
  });
});
