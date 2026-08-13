import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";

const mocks = vi.hoisted(() => ({
  pageContext: {
    isMobile: true,
  },
}));

vi.mock("vike-vue/usePageContext", () => ({
  usePageContext: () => mocks.pageContext,
}));

enableAutoUnmount(afterEach);

import SidebarProvider from "./SidebarProvider.vue";
import { useSidebar } from "./utils.ts";

const SidebarModeProbe = defineComponent({
  setup: () => ({ isMobile: useSidebar("hydration-test").isMobile }),
  template:
    '<span v-if="isMobile" data-sidebar-mode="mobile">mobile</span><span v-else data-sidebar-mode="desktop">desktop</span>',
});

const Root = defineComponent({
  components: { SidebarModeProbe, SidebarProvider },
  template:
    '<SidebarProvider id="hydration-test"><SidebarModeProbe /></SidebarProvider>',
});

type MediaQueryController = Readonly<{
  resizeTo: (width: number) => void;
}>;

const installMatchMedia = (initialWidth: number): MediaQueryController => {
  class MutableMediaQueryList extends EventTarget implements MediaQueryList {
    readonly media = "(max-width: 768px)";
    onchange: ((event: MediaQueryListEvent) => unknown) | null = null;
    #width = initialWidth;

    get matches(): boolean {
      return this.#width <= 768;
    }

    addListener = (
      _listener: ((event: MediaQueryListEvent) => unknown) | null,
    ): void => undefined;

    removeListener = (
      _listener: ((event: MediaQueryListEvent) => unknown) | null,
    ): void => undefined;

    resizeTo = (width: number): void => {
      this.#width = width;
      const event = new Event("change");
      Object.defineProperties(event, {
        matches: { value: this.matches },
        media: { value: this.media },
      });
      this.dispatchEvent(event);
      this.onchange?.(event as MediaQueryListEvent);
    };
  }

  const mediaQuery = new MutableMediaQueryList();
  vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);

  return { resizeTo: mediaQuery.resizeTo };
};

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("SidebarProvider hydration", () => {
  it("keeps the mobile SSR branch through hydration, then follows the 768px media query", async () => {
    mocks.pageContext.isMobile = true;
    const html = await renderToString(createSSRApp(Root));
    document.body.innerHTML = `<div id="app">${html}</div>`;
    const media = installMatchMedia(768);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const app = createSSRApp(Root);
    app.mount("#app");
    await nextTick();
    await flushPromises();

    expect(
      document.querySelector('[data-sidebar-mode="mobile"]'),
    ).not.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();

    media.resizeTo(769);
    await nextTick();

    expect(
      document.querySelector('[data-sidebar-mode="desktop"]'),
    ).not.toBeNull();
    app.unmount();
  });

  it("isolates providers with the same id across apps and nested trees", () => {
    const WidthProbe = defineComponent({
      props: { marker: { type: String, required: true } },
      setup: () => ({ width: useSidebar("shared-id").width }),
      template: '<span :data-width-probe="marker">{{ width }}</span>',
    });
    const IsolatedRoot = defineComponent({
      components: { SidebarProvider, WidthProbe },
      props: { width: { type: Number, required: true } },
      template:
        '<SidebarProvider id="shared-id" :width="width"><WidthProbe marker="isolated" /></SidebarProvider>',
    });
    const first = mount(IsolatedRoot, { props: { width: 260 } });
    const second = mount(IsolatedRoot, { props: { width: 320 } });

    expect(first.get('[data-width-probe="isolated"]').text()).toBe("260");
    expect(second.get('[data-width-probe="isolated"]').text()).toBe("320");

    const NestedRoot = defineComponent({
      components: { SidebarProvider, WidthProbe },
      template: `
        <SidebarProvider id="shared-id" :width="300">
          <WidthProbe marker="outer" />
          <SidebarProvider id="shared-id" :width="360">
            <WidthProbe marker="inner" />
          </SidebarProvider>
        </SidebarProvider>
      `,
    });
    const nested = mount(NestedRoot);

    expect(nested.get('[data-width-probe="outer"]').text()).toBe("300");
    expect(nested.get('[data-width-probe="inner"]').text()).toBe("360");
  });

  it("resolves a provider from a consumer loaded through another module copy", async () => {
    vi.resetModules();
    const { useSidebar: useCrossModuleSidebar } = await import("./utils.ts");
    const CrossModuleProbe = defineComponent({
      setup: () => ({ width: useCrossModuleSidebar("cross-copy").width }),
      template: "<span data-cross-copy>{{ width }}</span>",
    });
    const CrossModuleRoot = defineComponent({
      components: { CrossModuleProbe, SidebarProvider },
      template:
        '<SidebarProvider id="cross-copy" :width="350"><CrossModuleProbe /></SidebarProvider>',
    });

    const wrapper = mount(CrossModuleRoot);

    expect(wrapper.get("[data-cross-copy]").text()).toBe("350");
  });
});
