import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import Button from "@/app/components/Button.vue";
import { createPinia, setActivePinia } from "pinia";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("Button.vue", () => {
  it("should render text", () => {
    const text = "Test Button Text";
    const wrapper = mount(Button, {
      slots: {
        default: text,
      },
    });
    expect(wrapper.text()).toBe(text);
  });
});
