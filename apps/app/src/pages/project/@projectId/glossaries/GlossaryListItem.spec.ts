import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSSRApp } from "vue";
import { createI18n } from "vue-i18n";
import { renderToString } from "vue/server-renderer";

import englishMessages from "../../../../../locales/en_us.json";

const mocks = vi.hoisted(() => ({
  countTerm: vi.fn(),
  navigate: vi.fn(),
  rebuildRecall: vi.fn(),
  toastInfo: vi.fn(),
  toastRpcWarn: vi.fn(),
}));

vi.mock("vike/client/router", () => ({ navigate: mocks.navigate }));
vi.mock("#/rpc/orpc.ts", () => ({
  orpc: {
    glossary: {
      countTerm: mocks.countTerm,
      rebuildRecall: mocks.rebuildRecall,
    },
    project: { unlinkGlossary: vi.fn() },
  },
}));
vi.mock("#/stores/toast.ts", () => ({
  useToastStore: () => ({
    info: mocks.toastInfo,
    rpcWarn: mocks.toastRpcWarn,
  }),
}));
import GlossaryListItem from "./GlossaryListItem.vue";

const glossaryId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const glossary = {
  id: glossaryId,
  name: "Test glossary",
  description: null,
} as never;
const project = {
  id: projectId,
  name: "Test project",
} as never;
const href = "/glossary/11111111-1111-4111-8111-111111111111";

const createEnglishI18n = () =>
  createI18n({
    legacy: false,
    locale: "en_us",
    messages: { en_us: englishMessages },
  });

const mountGlossaryListItem = () =>
  mount(GlossaryListItem, {
    props: { glossary, project },
    global: { plugins: [createEnglishI18n()] },
  });

describe("GlossaryListItem navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.countTerm.mockResolvedValue(0);
    mocks.navigate.mockResolvedValue(undefined);
    mocks.rebuildRecall.mockResolvedValue({
      status: "STARTED",
      taskId: "33333333-3333-4333-8333-333333333333",
      total: 1,
    });
  });

  it("renders a canonical SSR link and enhances an ordinary click once", async () => {
    const app = createSSRApp(GlossaryListItem, { glossary, project });
    app.use(createEnglishI18n());
    const html = await renderToString(app);
    expect(html).toContain(`href="${href}"`);

    const wrapper = mountGlossaryListItem();
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
    const wrapper = mountGlossaryListItem();
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
    const wrapper = mountGlossaryListItem();
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

  it("starts Recall rebuild from its icon action and opens the resulting Task", async () => {
    const wrapper = mountGlossaryListItem();
    await flushPromises();

    const rebuild = wrapper.get('button[title="Rebuild term recall"]');
    expect(rebuild.attributes("aria-label")).toBe("Rebuild term recall");
    await rebuild.trigger("click");
    await flushPromises();

    expect(mocks.rebuildRecall).toHaveBeenCalledWith({
      glossaryId,
      projectId,
    });
    expect(mocks.navigate).toHaveBeenCalledWith(
      "/project/22222222-2222-4222-8222-222222222222/tasks?taskId=33333333-3333-4333-8333-333333333333",
    );
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    expect(mocks.toastRpcWarn).not.toHaveBeenCalled();
  });

  it("reports when a Recall rebuild has no glossary terms to schedule", async () => {
    mocks.rebuildRecall.mockResolvedValue({ status: "NO_WORK" });
    const wrapper = mountGlossaryListItem();
    await flushPromises();

    await wrapper.get('button[title="Rebuild term recall"]').trigger("click");
    await flushPromises();

    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "This glossary has no recall data to rebuild.",
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("disables glossary actions while Recall rebuild is in progress", async () => {
    let resolveRebuild: ((result: { status: "NO_WORK" }) => void) | undefined;
    const pending = new Promise<{ status: "NO_WORK" }>((resolve) => {
      resolveRebuild = resolve;
    });
    mocks.rebuildRecall.mockReturnValue(pending);
    const wrapper = mountGlossaryListItem();
    await flushPromises();

    const rebuild = wrapper.get('button[title="Rebuild term recall"]');
    await rebuild.trigger("click");
    await flushPromises();

    expect(rebuild.attributes("disabled")).toBeDefined();
    expect(rebuild.find("svg").classes()).toContain("animate-spin");
    expect(wrapper.findAll("button")[1]?.attributes("disabled")).toBeDefined();

    if (resolveRebuild === undefined) {
      throw new Error("Recall rebuild promise was not initialized");
    }
    resolveRebuild({ status: "NO_WORK" });
    await flushPromises();

    expect(rebuild.attributes("disabled")).toBeUndefined();
  });
});
