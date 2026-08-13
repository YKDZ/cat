import { afterEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { renderToString } from "vue/server-renderer";

vi.mock("#/components/MultiGlossaryPicker.vue", async () => {
  const { defineComponent } = await import("vue");
  return {
    default: defineComponent({ template: "<div />" }),
  };
});

vi.mock("#/rpc/orpc.ts", () => ({ orpc: {} }));
vi.mock("#/stores/toast.ts", () => ({
  useToastStore: () => ({ info: vi.fn(), rpcWarn: vi.fn() }),
}));

import GlossaryLinkerBtn from "./GlossaryLinkerBtn.vue";

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test project",
  description: null,
  creatorId: "22222222-2222-4222-8222-222222222222",
  features: {},
} as never;

const createApp = () => {
  const app = createSSRApp(GlossaryLinkerBtn, { project });
  app.use(
    createI18n({
      legacy: false,
      locale: "zh-CN",
      messages: { "zh-CN": { 连接术语库: "连接术语库" } },
    }),
  );
  return app;
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("GlossaryLinkerBtn SSR hydration", () => {
  it("hydrates one trigger button without framework warnings", async () => {
    const html = await renderToString(createApp());
    expect(html.match(/<button\b/g)).toHaveLength(1);
    document.body.innerHTML = `<div id="app">${html}</div>`;
    const warnings: string[] = [];
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const app = createApp();
    app.config.warnHandler = (message) => warnings.push(message);

    app.mount("#app");
    await nextTick();

    expect(document.querySelectorAll("button")).toHaveLength(1);
    expect(warnings).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    app.unmount();
  });
});
