import { expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import Button from "@/app/components/Button.vue";

test("should render text", () => {
  const wrapper = mount(Button, {
    slots: {
      default: "Test Button Text",
    },
  });
  expect(wrapper.text()).toContain("Hello world");
});
