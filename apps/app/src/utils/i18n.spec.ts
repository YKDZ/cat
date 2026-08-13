import { useTimeAgo } from "@vueuse/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h, nextTick } from "vue";
import { createI18n, useI18n } from "vue-i18n";
import { renderToString } from "vue/server-renderer";

import { createTimeAgoMessages } from "./i18n.ts";

const now = new Date("2026-08-02T12:00:00.000Z");

const englishMessages = {
  "{count} 个月": "{count} months",
  "{count} 分钟": "{count} minutes",
  "{count} 天": "{count} days",
  "{count} 小时": "{count} hours",
  "{count} 年": "{count} years",
  "{count} 秒": "{count} seconds",
  "{count} 周": "{count} weeks",
  "{time}前": "{time} ago",
  "{time}后": "in {time}",
  上月: "last month",
  上周: "last week",
  下月: "next month",
  下周: "next week",
  刚刚: "just now",
  去年: "last year",
  明天: "tomorrow",
  明年: "next year",
  昨天: "yesterday",
};

const createEnglishI18n = () =>
  createI18n({
    legacy: false,
    locale: "en_us",
    messages: { en_us: englishMessages },
  });

const RelativeTimeProbe = defineComponent({
  setup() {
    const { t } = useI18n();
    const messages = createTimeAgoMessages(t);
    const recent = useTimeAgo(new Date(now.getTime() - 30_000), {
      messages,
      updateInterval: 0,
    });
    const oneDayAgo = useTimeAgo(new Date(now.getTime() - 86_400_000), {
      messages,
      updateInterval: 0,
    });

    return () =>
      h("div", [
        h("span", { "data-relative-time": "recent" }, recent.value),
        h("span", { "data-relative-time": "day" }, oneDayAgo.value),
      ]);
  },
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("relative time localization", () => {
  it("uses the request composer consistently during English SSR and hydration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const serverApp = createSSRApp(RelativeTimeProbe);
    serverApp.use(createEnglishI18n());
    const html = await renderToString(serverApp);

    expect(html).toContain("just now");
    expect(html).toContain("yesterday");

    document.body.innerHTML = `<div id="app">${html}</div>`;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const clientApp = createSSRApp(RelativeTimeProbe);
    clientApp.use(createEnglishI18n());
    clientApp.mount("#app");
    await nextTick();

    expect(
      document.querySelector('[data-relative-time="recent"]')?.textContent,
    ).toBe("just now");
    expect(
      document.querySelector('[data-relative-time="day"]')?.textContent,
    ).toBe("yesterday");
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    clientApp.unmount();
  });
});
