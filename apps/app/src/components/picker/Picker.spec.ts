import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: String }) }));

import Picker from "./Picker.vue";

describe("Picker", () => {
  it("names the combobox trigger with its placeholder", () => {
    const wrapper = mount(Picker, {
      props: {
        options: [{ content: "English", value: "en" }],
        placeholder: "Choose a language",
        portal: false,
      },
    });

    expect(wrapper.get("button").attributes("aria-label")).toBe(
      "Choose a language",
    );
  });
});
