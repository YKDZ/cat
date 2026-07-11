import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const receivedAttrs = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock("reka-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("reka-ui")>();
  const { defineComponent, h } = await import("vue");

  return {
    ...actual,
    ComboboxRoot: defineComponent({
      name: "ComboboxRoot",
      inheritAttrs: false,
      setup:
        (_props, { attrs, slots }) =>
        () => {
          receivedAttrs.current = { ...attrs };
          return h("div", slots.default?.());
        },
    }),
    useForwardPropsEmits: (props: object) => props,
  };
});

import Combobox from "./Combobox.vue";

describe("Combobox", () => {
  it("leaves modelValue absent in uncontrolled mode", () => {
    mount(Combobox);
    expect(Object.hasOwn(receivedAttrs.current, "modelValue")).toBe(false);
  });

  it("forwards modelValue in controlled mode", () => {
    mount(Combobox, { props: { modelValue: "selected" } });
    expect(receivedAttrs.current["modelValue"]).toBe("selected");
  });
});
