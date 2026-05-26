import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import { i18n } from "@/utils/i18n";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("vike/client/router", () => ({
  navigate: mocks.navigate,
}));

import MyPersonalMemoryLink from "./MyPersonalMemoryLink.vue";

describe("MyPersonalMemoryLink", () => {
  it("renders personal memory info and navigates to detail page", async () => {
    mocks.navigate.mockResolvedValue(undefined);

    const wrapper = mount(MyPersonalMemoryLink, {
      props: {
        memory: {
          id: "11111111-1111-4111-8111-111111111111",
          name: "Minecraft Translator Draft",
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain("我的个人记忆");
    expect(wrapper.text()).toContain("Minecraft Translator Draft");

    await wrapper.get("button").trigger("click");

    expect(mocks.navigate).toHaveBeenCalledWith(
      "/memory/11111111-1111-4111-8111-111111111111",
    );
  });
});
