import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectObservations: vi.fn(),
  analyze: vi.fn(),
}));

vi.mock("#/rpc/orpc.ts", () => ({
  orpc: {
    languageAnalysis: {
      getProjectObservations: mocks.getProjectObservations,
      analyze: mocks.analyze,
    },
  },
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (value: string) => value }),
}));

vi.mock("#/stores/editor/context.ts", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");
  return {
    useEditorContextStore: defineStore("languageAnalysisStatusSpec", () => ({
      projectId: ref("11111111-1111-4111-8111-111111111111"),
      languageToId: ref("zh-Hans"),
    })),
  };
});

import LanguageAnalysisStatus from "./LanguageAnalysisStatus.vue";

const view = (status: "UNKNOWN" | "BLOCKED") => ({
  languageId: "zh-Hans",
  source: "WILDCARD",
  selection: null,
  tombstone: null,
  observation: null,
  assessment: {
    status,
    languageId: "zh-Hans",
    policyEpoch: 3,
    selection: null,
    blocker:
      status === "BLOCKED"
        ? {
            reason: "UNAVAILABLE",
            retryable: true,
            languageId: "zh-Hans",
            implementation: null,
            observedAt: new Date(),
            remediation: "RETRY_LATER",
          }
        : null,
    assessedAt: new Date(),
  },
});

describe("LanguageAnalysisStatus", () => {
  beforeEach(() => {
    mocks.getProjectObservations.mockReset();
  });

  it.each([
    ["UNKNOWN", "未知"],
    ["BLOCKED", "UNAVAILABLE · RETRY_LATER"],
  ] as const)(
    "renders %s from the observation-only batch read",
    async (status, text) => {
      mocks.getProjectObservations.mockResolvedValue([view(status)]);
      const wrapper = mount(LanguageAnalysisStatus, {
        global: { plugins: [createPinia()] },
      });
      await flushPromises();

      expect(mocks.getProjectObservations).toHaveBeenCalledWith({
        projectId: "11111111-1111-4111-8111-111111111111",
      });
      expect(mocks.analyze).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain(text);
    },
  );

  it("renders every blocked and unknown persisted project language", async () => {
    mocks.getProjectObservations.mockResolvedValue([
      { ...view("BLOCKED"), languageId: "de" },
      { ...view("UNKNOWN"), languageId: "fr" },
    ]);
    const wrapper = mount(LanguageAnalysisStatus, {
      global: { plugins: [createPinia()] },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("语言分析 (de)");
    expect(wrapper.text()).toContain("语言分析 (fr)");
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
