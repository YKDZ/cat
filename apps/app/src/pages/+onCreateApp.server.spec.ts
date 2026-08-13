import type { DisplayLanguage } from "@cat/shared";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSSRApp, h } from "vue";

const fsMocks = vi.hoisted(() => ({ readFile: vi.fn() }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    default: { ...actual, readFile: fsMocks.readFile },
    readFile: fsMocks.readFile,
  };
});

import { resolveDisplayLanguage } from "#/utils/display-language.ts";
import { createServerI18n } from "#/utils/i18n.server.ts";

import { onCreateApp } from "./+onCreateApp.server.ts";

const localeOf = (
  instance: NonNullable<Parameters<typeof onCreateApp>[0]["i18n"]>,
): string => instance.global.locale.value;

describe("server i18n", () => {
  beforeEach(() => {
    fsMocks.readFile.mockReset();
    fsMocks.readFile.mockResolvedValue('{"语言":"Language"}');
  });

  it("isolates concurrent requests with different locales", async () => {
    const globalContext = {
      i18nMessages: {
        en_us: { 语言: "Language" },
        zh_cn: {},
      },
    };

    const chineseApp = createSSRApp({ render: () => h("div") });
    const englishApp = createSSRApp({ render: () => h("div") });
    const chineseUse = vi.spyOn(chineseApp, "use");
    const englishUse = vi.spyOn(englishApp, "use");
    const chineseContext: Parameters<typeof onCreateApp>[0] = {
      app: chineseApp,
      displayLanguage: "zh_cn",
      globalContext,
      pinia: createPinia(),
    };
    const englishContext: Parameters<typeof onCreateApp>[0] = {
      app: englishApp,
      displayLanguage: "en_us",
      globalContext,
      pinia: createPinia(),
    };

    await Promise.all([
      onCreateApp(chineseContext),
      onCreateApp(englishContext),
    ]);

    const chinese = chineseContext.i18n;
    const english = englishContext.i18n;
    expect(chinese).toBeDefined();
    expect(english).toBeDefined();
    if (chinese === undefined || english === undefined) return;

    expect(chinese).not.toBe(english);
    expect(chineseUse).toHaveBeenCalledWith(chinese);
    expect(englishUse).toHaveBeenCalledWith(english);
    expect(localeOf(chinese)).toBe("zh_cn");
    expect(localeOf(english)).toBe("en_us");
    expect(chinese.global.t("语言")).toBe("语言");
    expect(english.global.t("语言")).toBe("Language");

    english.global.locale.value = "en_us";
    expect(localeOf(chinese)).toBe("zh_cn");
  });

  it("loads only statically mapped locale assets", async () => {
    const globalContext = {};
    const english = await createServerI18n({
      displayLanguage: "en_us",
      globalContext,
    });

    expect(globalContext).toEqual({
      i18nMessages: { en_us: { 语言: "Language" } },
    });
    expect(english.global.getLocaleMessage("en_us")).toEqual({
      语言: "Language",
    });
    expect(english.global.t("语言")).toBe("Language");
    expect(fsMocks.readFile).toHaveBeenCalledOnce();
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      expect.stringMatching(/locales\/en_us\.json$/),
      "utf-8",
    );

    const invalidCache = {};
    await expect(
      createServerI18n({
        displayLanguage: "../../secret" as DisplayLanguage,
        globalContext: invalidCache,
      }),
    ).rejects.toThrow();
    expect(fsMocks.readFile).toHaveBeenCalledOnce();
    expect(invalidCache).toEqual({});
  });

  it("does not read assets for malicious external values that resolve to the built-in locale", async () => {
    const displayLanguage = await resolveDisplayLanguage({
      cookie: "../../secret",
      acceptLanguage: "fr-FR",
      readDeploymentDefault: async () => "../deployment-secret",
    });

    const instance = await createServerI18n({
      displayLanguage,
      globalContext: {},
    });

    expect(localeOf(instance)).toBe("zh_cn");
    expect(fsMocks.readFile).not.toHaveBeenCalled();
  });
});
