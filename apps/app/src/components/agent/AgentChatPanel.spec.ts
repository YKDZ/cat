import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

import { i18n } from "@/utils/i18n";

import AgentChatPanel from "./AgentChatPanel.vue";

type MockScope = {
  projectId: string;
  languageToId: string;
  branchId?: number;
  contentNodeIds: string[];
  searchQuery: string;
  statusFilter:
    | "all"
    | "untranslated"
    | "translated"
    | "approved"
    | "unapproved";
  page: number;
  pageSize: number;
};

const mocks = vi.hoisted(() => ({
  listLLMProviders: vi.fn(),
  fetchDefinitions: vi.fn(),
  createSession: vi.fn(),
  sendMessage: vi.fn(),
  retryLastMessage: vi.fn(),
  cancelStreaming: vi.fn(),
  pauseGraphRun: vi.fn(),
  resumeGraphRun: vi.fn(),
  selectDefinition: vi.fn(),
  scope: null as MockScope | null,
  currentElementContentNodeId: undefined as string | undefined,
  messages: [] as unknown[],
  streamingText: "",
  thinkingText: "",
  streamingStatus: "idle",
  isStreaming: false,
  runId: null as string | null,
  activeSessionId: null as string | null,
  activeSessionContext: null as Record<string, unknown> | null,
  selectedDefinitionId: "agent-definition-1",
  selectedDefinition: {
    id: "agent-definition-1",
    name: "Editor Agent",
  },
  currentSteps: [] as unknown[],
  errorMessage: null as string | null,
  pendingConfirmation: null as Record<string, unknown> | null,
  maxStepsReached: null as Record<string, unknown> | null,
  lastFinishReason: null as string | null,
}));

vi.mock("@cat/ui", async () => {
  const { defineComponent } = await import("vue");
  return {
    Button: defineComponent({
      inheritAttrs: false,
      template: '<button v-bind="$attrs"><slot /></button>',
    }),
    ScrollArea: defineComponent({
      inheritAttrs: false,
      template:
        '<div v-bind="$attrs"><div data-reka-scroll-area-viewport><div><slot /></div></div></div>',
    }),
    Textarea: defineComponent({
      inheritAttrs: false,
      props: {
        modelValue: {
          type: String,
          default: "",
        },
      },
      emits: ["update:modelValue", "keydown"],
      template:
        '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />',
    }),
  };
});

vi.mock("@lucide/vue", () => {
  const icon = (name: string) =>
    defineComponent({
      template: `<svg data-icon="${name}" />`,
    });

  return {
    AlertTriangle: icon("alert-triangle"),
    ArrowRight: icon("arrow-right"),
    Pause: icon("pause"),
    Play: icon("play"),
    Plus: icon("plus"),
    RotateCcw: icon("rotate-ccw"),
    Square: icon("square"),
  };
});

vi.mock("@/rpc/orpc", () => ({
  orpc: {
    agent: {
      listLLMProviders: mocks.listLLMProviders,
    },
  },
}));

vi.mock("@/stores/agent", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useAgentStore: defineStore("agentChatPanelSpec", () => ({
      messages: computed(() => mocks.messages),
      streamingText: computed(() => mocks.streamingText),
      thinkingText: computed(() => mocks.thinkingText),
      streamingStatus: computed(() => mocks.streamingStatus),
      isStreaming: computed(() => mocks.isStreaming),
      runId: computed(() => mocks.runId),
      activeSessionId: computed(() => mocks.activeSessionId),
      activeSessionContext: computed(() => mocks.activeSessionContext),
      selectedDefinitionId: computed(() => mocks.selectedDefinitionId),
      selectedDefinition: computed(() => mocks.selectedDefinition),
      currentSteps: computed(() => mocks.currentSteps),
      errorMessage: computed(() => mocks.errorMessage),
      pendingConfirmation: computed(() => mocks.pendingConfirmation),
      maxStepsReached: computed(() => mocks.maxStepsReached),
      lastFinishReason: computed(() => mocks.lastFinishReason),
      fetchDefinitions(args: Record<string, unknown>) {
        return mocks.fetchDefinitions(args);
      },
      createSession(definitionId: string, metadata: Record<string, unknown>) {
        return mocks.createSession(definitionId, metadata);
      },
      sendMessage(text: string) {
        return mocks.sendMessage(text);
      },
      retryLastMessage() {
        return mocks.retryLastMessage();
      },
      cancelStreaming() {
        return mocks.cancelStreaming();
      },
      pauseGraphRun() {
        return mocks.pauseGraphRun();
      },
      resumeGraphRun() {
        return mocks.resumeGraphRun();
      },
      selectDefinition(value: string | null) {
        return mocks.selectDefinition(value);
      },
    })),
  };
});

vi.mock("@/stores/editor/context.ts", async () => {
  const { defineStore } = await import("pinia");
  const { computed } = await import("vue");

  return {
    useEditorContextStore: defineStore("agentEditorContextSpec", () => ({
      scope: computed(() => mocks.scope),
      currentElementContentNodeId: computed(
        () => mocks.currentElementContentNodeId,
      ),
    })),
  };
});

vi.mock("@/utils/agent/register-client-tools", () => ({
  useRegisterClientTools: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  clientLogger: {
    withSituation: vi.fn(() => ({
      error: vi.fn(),
    })),
  },
}));

describe("AgentChatPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {
          return undefined;
        }

        disconnect() {
          return undefined;
        }
      },
    );

    mocks.listLLMProviders.mockReset();
    mocks.fetchDefinitions.mockReset();
    mocks.createSession.mockReset();
    mocks.sendMessage.mockReset();
    mocks.retryLastMessage.mockReset();
    mocks.cancelStreaming.mockReset();
    mocks.pauseGraphRun.mockReset();
    mocks.resumeGraphRun.mockReset();
    mocks.selectDefinition.mockReset();

    mocks.listLLMProviders.mockResolvedValue([
      {
        id: 7,
        serviceId: "openai",
        name: "GPT",
      },
    ]);
    mocks.fetchDefinitions.mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue("session-1");
    mocks.sendMessage.mockResolvedValue(undefined);
    mocks.scope = {
      projectId: "11111111-1111-4111-8111-111111111111",
      languageToId: "zh-Hans",
      branchId: 42,
      contentNodeIds: [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      searchQuery: "",
      statusFilter: "all",
      page: 1,
      pageSize: 16,
    };
    mocks.currentElementContentNodeId = "44444444-4444-4444-8444-444444444444";
    mocks.messages = [];
    mocks.streamingText = "";
    mocks.thinkingText = "";
    mocks.streamingStatus = "idle";
    mocks.isStreaming = false;
    mocks.runId = null;
    mocks.activeSessionId = null;
    mocks.activeSessionContext = null;
    mocks.selectedDefinitionId = "agent-definition-1";
    mocks.selectedDefinition = {
      id: "agent-definition-1",
      name: "Editor Agent",
    };
    mocks.currentSteps = [];
    mocks.errorMessage = null;
    mocks.pendingConfirmation = null;
    mocks.maxStepsReached = null;
    mocks.lastFinishReason = null;
  });

  it("creates a new session with editor scope metadata", async () => {
    const wrapper = mount(AgentChatPanel, {
      props: {
        projectId: "11111111-1111-4111-8111-111111111111",
        projectName: "CAT Project",
      },
      global: {
        plugins: [createPinia(), i18n],
        stubs: {
          AgentMaxStepsCard: defineComponent({ template: "<div />" }),
          AgentMessageBubble: defineComponent({ template: "<div />" }),
          AgentProviderSelector: defineComponent({ template: "<div />" }),
          AgentSelector: defineComponent({ template: "<div />" }),
          AgentThinkingIndicator: defineComponent({ template: "<div />" }),
          AgentToolConfirmCard: defineComponent({ template: "<div />" }),
        },
      },
    });

    await flushPromises();

    await wrapper.get("textarea").setValue("  生成范围摘要  ");
    await wrapper.get('button[title="发送"]').trigger("click");
    await flushPromises();

    expect(mocks.createSession).toHaveBeenCalledWith("agent-definition-1", {
      projectId: "11111111-1111-4111-8111-111111111111",
      projectName: "CAT Project",
      providerId: 7,
      languageId: "zh-Hans",
      branchId: 42,
      contentNodeIds: [
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      currentElementContentNodeId: "44444444-4444-4444-8444-444444444444",
    });
    expect(mocks.sendMessage).toHaveBeenCalledWith("生成范围摘要");
  });
});
