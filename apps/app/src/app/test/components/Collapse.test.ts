import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import Collapse from "@/app/components/Collapse.vue";
import { defineComponent, h, nextTick } from "vue";

describe("Collapse.vue", () => {
  it("should hide text when click outside", async () => {
    const text = "Test Text";

    const wrapper = mount(Collapse, {
      props: {
        text,
      },
    });

    expect(wrapper.find("#collapse-text").exists()).toBe(true);
    expect(wrapper.find("#collapse-text").text()).toBe(text);
  });

  it("should show / hide text when clicked", async () => {
    const text = "Test Text";

    const wrapper = mount(Collapse, {
      slots: {
        default: text,
      },
    });

    // Default
    expect(wrapper.find("#collapse-content").exists()).toBe(false);

    // Show
    expect(wrapper.find("#click-trigger").exists()).toBe(true);
    await wrapper.find("#click-trigger").trigger("click");

    expect(wrapper.find("#collapse-content").exists()).toBe(true);
    expect(wrapper.find("#collapse-content").text()).toBe(text);

    // Hide
    await wrapper.find("#click-trigger").trigger("click");

    expect(wrapper.find("#collapse-content").exists()).toBe(false);
  });

  it("should hide text when click outside", async () => {
    const wrapper = mount(Collapse);

    // Default
    expect(wrapper.find("#collapse-content").exists()).toBe(false);

    // Show
    expect(wrapper.find("#click-trigger").exists()).toBe(true);
    await wrapper.find("#click-trigger").trigger("click");

    expect(wrapper.find("#collapse-content").exists()).toBe(true);

    // Hide
    document.body.click();
    await nextTick();

    expect(wrapper.find("#collapse-content").exists()).toBe(false);
  });
});
