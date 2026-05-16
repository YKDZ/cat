import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { i18n } from "@/utils/i18n";

import type { NonNullPluginDetail } from "../types";

import PluginConfigEditor from "../PluginConfigEditor.vue";

vi.mock("@cat/ui", async () => {
  const { defineComponent } = await import("vue");
  const passthrough = (tag: string) =>
    defineComponent({
      inheritAttrs: false,
      template: `<${tag} v-bind="$attrs"><slot /></${tag}>`,
    });

  return {
    Button: passthrough("button"),
    Card: passthrough("section"),
    CardContent: passthrough("div"),
    CardHeader: passthrough("div"),
    CardTitle: passthrough("h2"),
  };
});

vi.mock("@lucide/vue", () => ({
  Save: defineComponent({ template: '<svg data-icon="save" />' }),
  TestTube2: defineComponent({ template: '<svg data-icon="probe" />' }),
}));

vi.mock("@/components/json-form/JsonForm.vue", () => ({
  default: defineComponent({
    emits: ["update"],
    template:
      "<button data-testid=\"json-form-update\" @click=\"$emit('update', { endpoint: 'http://new' })\">update</button>",
  }),
}));

const NOW = new Date("2026-05-16T00:00:00.000Z");

const createNoConfigDetail = (): NonNullPluginDetail => ({
  plugin: {
    id: "basic-tokenizer",
    name: "@cat-plugin/basic-tokenizer",
    overview: "Tokenizer",
    isExternal: false,
    entry: "index.js",
    iconUrl: null,
    version: "0.0.1",
    createdAt: NOW,
    updatedAt: NOW,
  },
  manifest: null,
  manifestError: null,
  installation: { id: 1 },
  isInstalled: true,
  runtimeStatus: "INACTIVE",
  runtime: {
    isActive: false,
    hasRoute: false,
    serviceAmount: 1,
    componentAmount: 0,
    lastError: null,
  },
  config: {
    hasConfig: false,
    schema: null,
    config: null,
    instance: null,
    value: {},
    expectedUpdatedAt: null,
  },
  capabilities: {
    services: [],
    components: [],
    hasRuntimeRoute: false,
    permissions: [],
  },
  actions: {
    canInstall: false,
    canUninstall: true,
    canSaveConfig: false,
    canReload: true,
    canRetryApply: false,
    canProbeCandidate: false,
    canProbeRuntime: false,
  },
});

const createConfigDetail = (): NonNullPluginDetail => ({
  plugin: {
    id: "configurable-plugin",
    name: "@cat-plugin/configurable-plugin",
    overview: "Configurable plugin",
    isExternal: false,
    entry: "index.js",
    iconUrl: null,
    version: "0.0.1",
    createdAt: NOW,
    updatedAt: NOW,
  },
  manifest: null,
  manifestError: null,
  installation: { id: 1 },
  isInstalled: true,
  runtimeStatus: "ACTIVE",
  runtime: {
    isActive: true,
    hasRoute: false,
    serviceAmount: 1,
    componentAmount: 0,
    lastError: null,
  },
  config: {
    hasConfig: true,
    schema: {
      type: "object",
      properties: { endpoint: { type: "string" } },
    },
    config: {
      id: 1,
      pluginId: "configurable-plugin",
      schema: {
        type: "object",
        properties: { endpoint: { type: "string" } },
      },
      createdAt: NOW,
      updatedAt: NOW,
    },
    instance: {
      id: 2,
      value: { endpoint: "http://old" },
      creatorId: null,
      configId: 1,
      pluginInstallationId: 1,
      createdAt: NOW,
      updatedAt: NOW,
    },
    value: { endpoint: "http://old" },
    expectedUpdatedAt: NOW.toISOString(),
  },
  capabilities: {
    services: [],
    components: [],
    hasRuntimeRoute: false,
    permissions: [],
  },
  actions: {
    canInstall: false,
    canUninstall: true,
    canSaveConfig: true,
    canReload: true,
    canRetryApply: false,
    canProbeCandidate: true,
    canProbeRuntime: true,
  },
});

describe("PluginConfigEditor", () => {
  it("renders the no-config state without emitting save", () => {
    const wrapper = mount(PluginConfigEditor, {
      props: {
        detail: createNoConfigDetail(),
        isSaving: false,
        isProbing: false,
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain("此插件没有配置项");
    expect(wrapper.emitted("save")).toBeUndefined();
  });

  it("emits save with the edited value and expectedUpdatedAt", async () => {
    const wrapper = mount(PluginConfigEditor, {
      props: {
        detail: createConfigDetail(),
        isSaving: false,
        isProbing: false,
      },
      global: {
        plugins: [i18n],
      },
    });

    await wrapper.get('[data-testid="json-form-update"]').trigger("click");
    const saveButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("保存并应用"));
    expect(saveButton).toBeDefined();
    await saveButton!.trigger("click");

    expect(wrapper.emitted("save")).toEqual([
      [{ endpoint: "http://new" }, NOW.toISOString()],
    ]);
  });
});
