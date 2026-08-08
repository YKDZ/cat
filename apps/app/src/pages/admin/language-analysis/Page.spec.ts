import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

const implementation = {
  pluginId: "custom-analyzer",
  serviceId: "analyzer",
  serviceType: "LANGUAGE_ANALYZER",
  scopeType: "GLOBAL",
  scopeId: "",
};

const mocks = vi.hoisted(() => ({
  listSelections: vi.fn(),
  listImplementations: vi.fn(),
  writeSelection: vi.fn(),
  getObservation: vi.fn(),
  rpcWarn: vi.fn(),
}));

vi.mock("@cat/ui", async () => {
  const { defineComponent } = await import("vue");
  return {
    Button: defineComponent({
      inheritAttrs: false,
      template: '<button v-bind="$attrs"><slot /></button>',
    }),
    Input: defineComponent({
      props: { modelValue: { type: String, required: true } },
      emits: ["update:modelValue"],
      template:
        '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    }),
  };
});

vi.mock("#/rpc/orpc.ts", () => ({
  orpc: {
    languageAnalysis: {
      listSelections: mocks.listSelections,
      listImplementations: mocks.listImplementations,
      writeSelection: mocks.writeSelection,
      getObservation: mocks.getObservation,
    },
  },
}));

vi.mock("#/stores/toast.ts", () => ({
  useToastStore: () => ({ rpcWarn: mocks.rpcWarn }),
}));

import Page from "./+Page.vue";

const createTestI18n = () =>
  createI18n({
    legacy: false,
    locale: "zh-CN",
    messages: { "zh-CN": {} },
  });

describe("Language Analysis administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSelections.mockResolvedValue([]);
    mocks.listImplementations.mockResolvedValue([implementation]);
  });

  it("keeps the operator input intact after a CAS conflict", async () => {
    mocks.writeSelection.mockRejectedValue(new Error("CONFLICT"));
    const wrapper = mount(Page, {
      global: { plugins: [createTestI18n()] },
    });
    await flushPromises();

    await wrapper.get('input[aria-label="Language"]').setValue("de");
    await wrapper.get("select").setValue(JSON.stringify(implementation));
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.rpcWarn).toHaveBeenCalled();
    expect(wrapper.get('input[aria-label="Language"]').element).toHaveProperty(
      "value",
      "de",
    );
    expect(wrapper.get("select").element).toHaveProperty(
      "value",
      JSON.stringify(implementation),
    );
    expect(mocks.listSelections).toHaveBeenCalledTimes(1);
  });

  it("diagnoses exact tombstone fallback, missing implementation, and remediation", async () => {
    const updatedAt = new Date("2026-08-01T00:00:00.000Z");
    const fingerprint = `sha256:${"a".repeat(64)}`;
    const wildcard = {
      key: "*",
      implementation,
      revision: 2,
      configurationFingerprint: fingerprint,
      updatedAt,
    };
    const tombstone = {
      key: "de",
      implementation: null,
      revision: 4,
      configurationFingerprint: null,
      updatedAt,
    };
    mocks.listSelections.mockResolvedValue([wildcard, tombstone]);
    mocks.getObservation.mockResolvedValue({
      languageId: "de",
      source: "WILDCARD",
      selection: wildcard,
      tombstone,
      observation: {
        languageId: "de",
        policyEpoch: 8,
        selectionKey: "*",
        selectionRevision: 2,
        configurationFingerprint: fingerprint,
        assessment: {},
        observedAt: updatedAt,
      },
      assessment: {
        status: "BLOCKED",
        languageId: "de",
        policyEpoch: 8,
        selection: wildcard,
        blocker: {
          reason: "MISSING_IMPLEMENTATION",
          retryable: false,
          languageId: "de",
          implementation,
          observedAt: updatedAt,
          remediation: "INSTALL_IMPLEMENTATION",
        },
        assessedAt: updatedAt,
      },
    });
    const wrapper = mount(Page, {
      global: { plugins: [createTestI18n()] },
    });
    await flushPromises();

    await wrapper.get("tbody tr:nth-child(2)").trigger("click");
    await flushPromises();

    expect(mocks.getObservation).toHaveBeenCalledWith("de");
    expect(wrapper.text()).toContain("WILDCARD");
    expect(wrapper.text()).toContain("Deleted");
    expect(wrapper.text()).toContain("MISSING_IMPLEMENTATION");
    expect(wrapper.text()).toContain("INSTALL_IMPLEMENTATION");
    expect(wrapper.text()).toContain(fingerprint);
  });
});
