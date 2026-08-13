import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: String }) }));
vi.mock("./InsertTermText.vue", async () => {
  const { defineComponent } = await import("vue");
  return { default: defineComponent({ template: "<div>term form</div>" }) };
});

import InsertTermBtn from "./InsertTermBtn.vue";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("InsertTermBtn", () => {
  it("opens an accessible dialog without framework warnings", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const wrapper = mount(InsertTermBtn, {
      attachTo: document.body,
      props: {
        glossaryId: "11111111-1111-4111-8111-111111111111",
        glossaryProjectIds: [],
      },
    });

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(consoleWarn).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
