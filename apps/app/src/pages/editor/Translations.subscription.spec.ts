import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({
  refetch: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("pinia", async (importOriginal) => {
  const pinia = await importOriginal<typeof import("pinia")>();
  return { ...pinia, storeToRefs: <T>(store: T): T => store };
});

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("#/stores/editor/table.ts", () => ({
  useEditorTableStore: () => ({ elementId: ref(1) }),
}));

vi.mock("#/stores/editor/translation.ts", () => ({
  useEditorTranslationStore: () => ({
    refetch: mocks.refetch,
    state: ref({ data: [] }),
    subscribe: mocks.subscribe,
    unsubscribe: mocks.unsubscribe,
  }),
}));

vi.mock("#/utils/vue.ts", () => ({
  watchClient: (
    _source: unknown,
    callback: () => void,
    options?: { immediate?: boolean },
  ) => {
    if (options?.immediate) callback();
  },
}));

vi.mock("./Translation.vue", () => ({
  default: { template: "<div />" },
}));

import Translations from "./Translations.vue";

describe("Translations subscription lifecycle", () => {
  it("subscribes again when the same store is remounted after unsubscription", () => {
    const first = mount(Translations, {
      global: { stubs: { Translation: true } },
    });

    expect(mocks.subscribe).toHaveBeenCalledOnce();

    first.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();

    mount(Translations, { global: { stubs: { Translation: true } } });
    expect(mocks.subscribe).toHaveBeenCalledTimes(2);
  });
});
