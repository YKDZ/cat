import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { i18n } from "@/utils/i18n";

import type { NonNullPluginDetail, PluginProbeResult } from "../types";

import PluginDetailShell from "../PluginDetailShell.vue";

vi.mock("@cat/ui", async () => {
  const { defineComponent } = await import("vue");
  const passthrough = (tag: string) =>
    defineComponent({
      inheritAttrs: false,
      template: `<${tag} v-bind="$attrs"><slot /></${tag}>`,
    });

  return {
    Badge: passthrough("span"),
    Button: passthrough("button"),
    Card: passthrough("section"),
    CardContent: passthrough("div"),
    CardHeader: passthrough("div"),
    CardTitle: passthrough("h2"),
  };
});

vi.mock("@lucide/vue", () => ({
  Download: defineComponent({ template: '<svg data-icon="download" />' }),
  RefreshCw: defineComponent({ template: '<svg data-icon="reload" />' }),
  Save: defineComponent({ template: '<svg data-icon="save" />' }),
  TestTube2: defineComponent({ template: '<svg data-icon="probe" />' }),
  Trash2: defineComponent({ template: '<svg data-icon="trash" />' }),
  XCircle: defineComponent({ template: '<svg data-icon="cancel" />' }),
}));

const NOW = new Date("2026-05-16T00:00:00.000Z");

const createDetail = (overrides?: {
  runtimeStatus?: NonNullPluginDetail["runtimeStatus"];
  runtimeLastError?: string | null;
  canRetryApply?: boolean;
  probeRuntime?: boolean;
}): NonNullPluginDetail => ({
  plugin: {
    id: "basic-tokenizer",
    name: "@cat-plugin/basic-tokenizer",
    overview: "Tokenizer overview",
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
  runtimeStatus: overrides?.runtimeStatus ?? "INACTIVE",
  runtime: {
    isActive: false,
    hasRoute: false,
    serviceAmount: 1,
    componentAmount: 0,
    lastError: overrides?.runtimeLastError ?? null,
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
    services: [
      {
        serviceType: "TOKENIZER",
        serviceId: "newline-tokenizer",
        source: "MANIFEST",
        dynamic: false,
        supportsProbe: false,
        probeBillable: false,
        probeRequiresInstall: false,
        unsupportedReason: "此服务类型没有平台内置通用检测。",
      },
    ],
    components: [],
    hasRuntimeRoute: false,
    permissions: [],
  },
  actions: {
    canInstall: false,
    canUninstall: true,
    canSaveConfig: false,
    canReload: true,
    canRetryApply: overrides?.canRetryApply ?? false,
    canProbeCandidate: false,
    canProbeRuntime: overrides?.probeRuntime ?? false,
  },
});

const unsupportedProbeResult: PluginProbeResult = {
  target: "RUNTIME",
  overallStatus: "UNSUPPORTED",
  results: [
    {
      serviceType: "EMAIL_PROVIDER",
      serviceId: "mailer",
      status: "UNSUPPORTED",
      billable: false,
      latencyMs: null,
      summary: {},
      warnings: [],
      error: {
        category: "UNSUPPORTED",
        message: "authorization=[REDACTED]",
      },
    },
  ],
};

describe("PluginDetailShell", () => {
  it("renders metadata, service badges, and the no-config badge", () => {
    const wrapper = mount(PluginDetailShell, {
      props: {
        detail: createDetail(),
        probeResult: null,
        isBusy: false,
        isSaving: false,
        isProbing: false,
      },
      global: {
        plugins: [i18n],
        stubs: {
          PluginConfigEditor: defineComponent({
            template: '<div data-testid="config-editor-stub" />',
          }),
        },
      },
    });

    expect(wrapper.text()).toContain("basic-tokenizer");
    expect(wrapper.text()).toContain("0.0.1");
    expect(wrapper.text()).toContain("无配置");
    expect(wrapper.text()).toContain(
      "TOKENIZER · newline-tokenizer · MANIFEST",
    );
  });

  it("requires confirmation before emitting uninstall", async () => {
    const wrapper = mount(PluginDetailShell, {
      props: {
        detail: createDetail(),
        probeResult: null,
        isBusy: false,
        isSaving: false,
        isProbing: false,
      },
      global: {
        plugins: [i18n],
        stubs: {
          PluginConfigEditor: defineComponent({
            template: '<div data-testid="config-editor-stub" />',
          }),
        },
      },
    });

    await wrapper.get("button[variant='destructive']").trigger("click");
    expect(wrapper.text()).toContain(
      "确认从当前作用域卸载此插件？配置实例也会被删除。",
    );

    const confirmButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("确认卸载"));
    expect(confirmButton).toBeDefined();
    await confirmButton!.trigger("click");

    expect(wrapper.emitted("uninstall")).toHaveLength(1);
  });

  it("renders degraded runtime state and retry guidance", () => {
    const wrapper = mount(PluginDetailShell, {
      props: {
        detail: createDetail({
          runtimeStatus: "DEGRADED",
          runtimeLastError: "插件配置应用失败，自动回滚也失败",
          canRetryApply: true,
        }),
        probeResult: null,
        isBusy: false,
        isSaving: false,
        isProbing: false,
      },
      global: {
        plugins: [i18n],
        stubs: {
          PluginConfigEditor: defineComponent({
            template: '<div data-testid="config-editor-stub" />',
          }),
        },
      },
    });

    expect(wrapper.text()).toContain("插件配置应用失败，自动回滚也失败");
    expect(wrapper.text()).toContain("请重试应用或手动重载；必要时重启服务。");
    expect(wrapper.text()).toContain("重试应用");
  });

  it("renders unsupported probe results with redacted messages", () => {
    const wrapper = mount(PluginDetailShell, {
      props: {
        detail: createDetail(),
        probeResult: unsupportedProbeResult,
        isBusy: false,
        isSaving: false,
        isProbing: false,
      },
      global: {
        plugins: [i18n],
        stubs: {
          PluginConfigEditor: defineComponent({
            template: '<div data-testid="config-editor-stub" />',
          }),
        },
      },
    });

    expect(wrapper.text()).toContain("[REDACTED]");
    expect(wrapper.text()).not.toContain("sk-secret");
  });
});
