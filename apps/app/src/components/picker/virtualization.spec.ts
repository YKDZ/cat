import { config, shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, type PropType } from "vue";

import MultiPicker from "./MultiPicker.vue";
import Picker from "./Picker.vue";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (value: string) => value }),
}));

config.global.renderStubDefaultSlot = true;

const options = Array.from({ length: 1_000 }, (_, value) => ({
  value,
  content: `Option ${value}`,
}));

const VirtualizerStub = defineComponent({
  name: "ComboboxVirtualizer",
  props: {
    options: { type: Array as PropType<typeof options>, required: true },
    estimateSize: { type: Number, required: true },
  },
  setup:
    (props, { slots }) =>
    () =>
      h("div", slots.default?.({ option: props.options[0] })),
});

describe.each([
  ["Picker", Picker, { placeholder: "Choose" }],
  ["MultiPicker", MultiPicker, {}],
])("%s virtualization", (_name, component, extraProps) => {
  it("delegates the complete option set to the Reka virtualizer", () => {
    const wrapper = shallowMount(component, {
      props: { options, ...extraProps },
      global: {
        stubs: { ComboboxVirtualizer: VirtualizerStub },
      },
    });

    const virtualizer = wrapper.findComponent({ name: "ComboboxVirtualizer" });
    expect(virtualizer.exists()).toBe(true);
    expect(virtualizer.props("options")).toEqual(options);
    expect(virtualizer.props("estimateSize")).toBe(40);
  });
});
