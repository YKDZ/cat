import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";

const mocks = vi.hoisted(() => ({
  countTerm: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("vike/client/router", () => ({ navigate: mocks.navigate }));
vi.mock("#/rpc/orpc.ts", () => ({
  orpc: {
    glossary: { countTerm: mocks.countTerm },
    project: { unlinkGlossary: vi.fn() },
  },
}));
vi.mock("#/stores/toast.ts", () => ({
  useToastStore: () => ({ info: vi.fn(), rpcWarn: vi.fn() }),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: String }) }));

import GlossaryListItem from "./GlossaryListItem.vue";

const glossary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test glossary",
  description: null,
} as never;
const project = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Test project",
} as never;
const href = "/glossary/11111111-1111-4111-8111-111111111111";

describe("GlossaryListItem navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.countTerm.mockResolvedValue(0);
    mocks.navigate.mockResolvedValue(undefined);
  });

  it("renders a canonical SSR link and enhances an ordinary click once", async () => {
    const html = await renderToString(
      createSSRApp(GlossaryListItem, { glossary, project }),
    );
    expect(html).toContain(`href="${href}"`);

    const wrapper = mount(GlossaryListItem, {
      props: { glossary, project },
    });
    await flushPromises();
    const link = wrapper.get("a");
    expect(link.attributes("href")).toBe(href);

    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.navigate).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith(href);
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
    ["middle click", { button: 1 }],
  ])("leaves %s glossary links to the browser", async (_name, init) => {
    const wrapper = mount(GlossaryListItem, {
      props: { glossary, project },
    });
    await flushPromises();
    const link = wrapper.get("a");
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      ...init,
    });

    link.element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(false);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("leaves an already handled glossary link untouched", async () => {
    const wrapper = mount(GlossaryListItem, {
      props: { glossary, project },
    });
    await flushPromises();
    wrapper.element.addEventListener(
      "click",
      (event: Event) => event.preventDefault(),
      { capture: true, once: true },
    );
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });

    wrapper.get("a").element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
